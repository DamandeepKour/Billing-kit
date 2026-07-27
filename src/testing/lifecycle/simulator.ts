/**
 * Stripe-style billing lifecycle simulation helpers.
 *
 * These mirror the workflows covered by Stripe Test Clocks / Billing docs:
 * trials, renewals, payment failures, upgrades, and multi-phase schedules.
 * They advance an in-memory clock and subscription fixture — no live Stripe API.
 */

export type SimulatedProviderStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "paused";

export interface TestClock {
  /** Current simulated unix seconds. */
  readonly now: number;
  /** Current simulated Date. */
  readonly date: Date;
  /** Advance by a number of seconds. */
  advanceBy(seconds: number): number;
  /** Advance by whole days. */
  advanceByDays(days: number): number;
  /** Jump to an absolute unix timestamp (must be >= now). */
  advanceTo(unixSeconds: number): number;
  /** Freeze / read helper for assertions. */
  toISOString(): string;
}

export interface SimulatedSubscriptionItem {
  id: string;
  priceId: string;
  unitAmount?: number;
}

export interface SimulatedSubscription {
  id: string;
  customerId: string;
  status: SimulatedProviderStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  trialEnd?: number;
  pauseCollection: null | { behavior: string; resumes_at?: number };
  items: SimulatedSubscriptionItem[];
  metadata: Record<string, string>;
  scheduleId?: string;
}

export interface SubscriptionPhase {
  /** Price / plan id for this phase. */
  priceId: string;
  /** Billing interval length in days (default 30). */
  intervalDays?: number;
  /** How many intervals before advancing (default 1). null = open-ended. */
  iterations?: number | null;
  /** When true, first interval is a trial (status trialing). */
  trial?: boolean;
  unitAmount?: number;
}

export interface CreateSimulatedSubscriptionInput {
  id?: string;
  customerId: string;
  priceId: string;
  unitAmount?: number;
  /** Days of free trial before first paid period (default 0). */
  trialDays?: number;
  /** Paid period length in days (default 30). */
  intervalDays?: number;
  metadata?: Record<string, string>;
  itemId?: string;
}

export function createTestClock(start: Date | number = Date.UTC(2026, 0, 1)): TestClock {
  let now: number;
  if (typeof start === "number") {
    // Accept unix seconds or epoch milliseconds.
    now = start > 1e12 ? Math.floor(start / 1000) : Math.floor(start);
  } else {
    now = Math.floor(start.getTime() / 1000);
  }

  return {
    get now() {
      return now;
    },
    get date() {
      return new Date(now * 1000);
    },
    advanceBy(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error("advanceBy requires a non-negative finite number");
      }
      now += Math.floor(seconds);
      return now;
    },
    advanceByDays(days: number) {
      return this.advanceBy(days * 24 * 60 * 60);
    },
    advanceTo(unixSeconds: number) {
      if (!Number.isFinite(unixSeconds)) {
        throw new Error("advanceTo requires a finite unix timestamp");
      }
      if (unixSeconds < now) {
        throw new Error(
          `Cannot move test clock backwards (now=${now}, target=${unixSeconds})`,
        );
      }
      now = Math.floor(unixSeconds);
      return now;
    },
    toISOString() {
      return new Date(now * 1000).toISOString();
    },
  };
}

export function createSimulatedSubscription(
  clock: TestClock,
  input: CreateSimulatedSubscriptionInput,
): SimulatedSubscription {
  const intervalDays = input.intervalDays ?? 30;
  const trialDays = input.trialDays ?? 0;
  const periodStart = clock.now;
  const trialEnd =
    trialDays > 0 ? periodStart + trialDays * 24 * 60 * 60 : undefined;
  const currentPeriodEnd =
    trialEnd ?? periodStart + intervalDays * 24 * 60 * 60;

  return {
    id: input.id ?? "sub_sim_1",
    customerId: input.customerId,
    status: trialDays > 0 ? "trialing" : "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: periodStart,
    currentPeriodEnd,
    trialEnd,
    pauseCollection: null,
    items: [
      {
        id: input.itemId ?? "si_sim_1",
        priceId: input.priceId,
        unitAmount: input.unitAmount,
      },
    ],
    metadata: { ...input.metadata },
  };
}

/**
 * Apply clock time to the subscription fixture.
 * Handles trial end → active and period-end cancellation.
 */
export function syncSubscriptionToClock(
  subscription: SimulatedSubscription,
  clock: TestClock,
): SimulatedSubscription {
  const next = { ...subscription, items: [...subscription.items] };

  if (
    next.status === "trialing" &&
    next.trialEnd !== undefined &&
    clock.now >= next.trialEnd
  ) {
    next.status = "active";
    next.currentPeriodStart = next.trialEnd;
    // Keep existing period end if it was trial end; caller may renew after.
    if (next.currentPeriodEnd <= clock.now) {
      next.currentPeriodEnd = next.trialEnd;
    }
  }

  if (
    next.cancelAtPeriodEnd &&
    clock.now >= next.currentPeriodEnd &&
    next.status !== "canceled"
  ) {
    next.status = "canceled";
    next.cancelAtPeriodEnd = false;
    next.pauseCollection = null;
  }

  return next;
}

/** Successful renewal: advance current period by intervalDays. */
export function renewSimulatedSubscription(
  subscription: SimulatedSubscription,
  clock: TestClock,
  intervalDays = 30,
): SimulatedSubscription {
  const synced = syncSubscriptionToClock(subscription, clock);
  if (synced.status === "canceled") {
    throw new Error("Cannot renew a canceled subscription");
  }
  if (synced.cancelAtPeriodEnd) {
    throw new Error("Cannot renew while cancel_at_period_end is set");
  }

  const periodStart = Math.max(synced.currentPeriodEnd, clock.now);
  const recovered =
    synced.status === "past_due" ||
    synced.status === "unpaid" ||
    synced.status === "trialing"
      ? "active"
      : synced.status;

  return {
    ...synced,
    status: recovered,
    trialEnd: undefined,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodStart + intervalDays * 24 * 60 * 60,
  };
}

/** Simulate a failed invoice / payment for the current period. */
export function failSimulatedPayment(
  subscription: SimulatedSubscription,
  options: { unpaid?: boolean } = {},
): SimulatedSubscription {
  if (subscription.status === "canceled") {
    throw new Error("Cannot fail payment on a canceled subscription");
  }
  return {
    ...subscription,
    status: options.unpaid ? "unpaid" : "past_due",
  };
}

/** Recover from past_due / unpaid after a successful payment. */
export function recoverSimulatedPayment(
  subscription: SimulatedSubscription,
): SimulatedSubscription {
  if (subscription.status !== "past_due" && subscription.status !== "unpaid") {
    return subscription;
  }
  return { ...subscription, status: "active" };
}

/** Simulate an in-period upgrade/downgrade to a new price. */
export function upgradeSimulatedSubscription(
  subscription: SimulatedSubscription,
  input: { priceId: string; unitAmount?: number; itemId?: string },
): SimulatedSubscription {
  if (subscription.status === "canceled") {
    throw new Error("Cannot upgrade a canceled subscription");
  }
  const primary = subscription.items[0];
  const items =
    subscription.items.length === 0
      ? [
          {
            id: input.itemId ?? "si_sim_1",
            priceId: input.priceId,
            unitAmount: input.unitAmount,
          },
        ]
      : [
          {
            id: primary?.id ?? input.itemId ?? "si_sim_1",
            priceId: input.priceId,
            unitAmount: input.unitAmount ?? primary?.unitAmount,
          },
          ...subscription.items.slice(1),
        ];

  return {
    ...subscription,
    items,
    metadata: {
      ...subscription.metadata,
      upgradedFrom: primary?.priceId ?? "",
      upgradedTo: input.priceId,
    },
  };
}

export function scheduleSimulatedCancellation(
  subscription: SimulatedSubscription,
): SimulatedSubscription {
  if (subscription.status === "canceled") {
    throw new Error("Subscription is already canceled");
  }
  return { ...subscription, cancelAtPeriodEnd: true };
}

/** Undo cancel-at-period-end (BillingKit renewSubscription semantics). */
export function undoSimulatedCancellation(
  subscription: SimulatedSubscription,
): SimulatedSubscription {
  return { ...subscription, cancelAtPeriodEnd: false };
}

export function pauseSimulatedSubscription(
  subscription: SimulatedSubscription,
  options: { behavior?: string; resumesAt?: number } = {},
): SimulatedSubscription {
  return {
    ...subscription,
    pauseCollection: {
      behavior: options.behavior ?? "mark_uncollectible",
      ...(options.resumesAt !== undefined
        ? { resumes_at: options.resumesAt }
        : {}),
    },
    status: "paused",
  };
}

export function resumeSimulatedSubscription(
  subscription: SimulatedSubscription,
  clock?: TestClock,
): SimulatedSubscription {
  const stillInTrial =
    subscription.trialEnd !== undefined &&
    (clock ? clock.now < subscription.trialEnd : false);

  return {
    ...subscription,
    pauseCollection: null,
    status: stillInTrial ? "trialing" : "active",
  };
}

/** Shape compatible with StripeGateway mapSubscription / test mocks. */
export function toStripeSubscriptionObject(
  subscription: SimulatedSubscription,
): Record<string, unknown> {
  return {
    id: subscription.id,
    object: "subscription",
    customer: subscription.customerId,
    status: subscription.status === "paused" ? "active" : subscription.status,
    current_period_start: subscription.currentPeriodStart,
    current_period_end: subscription.currentPeriodEnd,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    trial_end: subscription.trialEnd ?? null,
    pause_collection: subscription.pauseCollection,
    metadata: subscription.metadata,
    schedule: subscription.scheduleId ?? null,
    items: {
      object: "list",
      data: subscription.items.map((item) => ({
        id: item.id,
        price: {
          id: item.priceId,
          unit_amount: item.unitAmount,
        },
      })),
    },
  };
}

export interface SimulatedScheduleState {
  id: string;
  customerId: string;
  phases: SubscriptionPhase[];
  phaseIndex: number;
  phaseIteration: number;
  subscription: SimulatedSubscription;
}

/**
 * Multi-phase subscription schedule simulator (Stripe Subscription Schedules style).
 * Call `advanceSchedulePhase` after each interval completes on the test clock.
 */
export function createSimulatedSchedule(
  clock: TestClock,
  input: {
    id?: string;
    customerId: string;
    phases: SubscriptionPhase[];
  },
): SimulatedScheduleState {
  if (input.phases.length === 0) {
    throw new Error("Schedule requires at least one phase");
  }
  const phase = input.phases[0]!;
  const subscription = createSimulatedSubscription(clock, {
    id: `sub_${input.id ?? "sched_1"}`,
    customerId: input.customerId,
    priceId: phase.priceId,
    unitAmount: phase.unitAmount,
    trialDays: phase.trial ? phase.intervalDays ?? 30 : 0,
    intervalDays: phase.intervalDays ?? 30,
  });
  subscription.scheduleId = input.id ?? "sched_1";

  return {
    id: input.id ?? "sched_1",
    customerId: input.customerId,
    phases: input.phases,
    phaseIndex: 0,
    phaseIteration: 1,
    subscription,
  };
}

/**
 * Advance to the next phase iteration or next phase when the current period ends.
 * Moves the test clock to the subscription's currentPeriodEnd first.
 */
export function advanceSchedulePhase(
  clock: TestClock,
  state: SimulatedScheduleState,
): SimulatedScheduleState {
  clock.advanceTo(state.subscription.currentPeriodEnd);

  const phase = state.phases[state.phaseIndex]!;
  const iterations = phase.iterations === undefined ? 1 : phase.iterations;
  const intervalDays = phase.intervalDays ?? 30;

  let phaseIndex = state.phaseIndex;
  let phaseIteration = state.phaseIteration;
  let subscription = syncSubscriptionToClock(state.subscription, clock);

  const shouldStayInPhase =
    iterations === null || phaseIteration < iterations;

  if (shouldStayInPhase) {
    phaseIteration += 1;
    subscription = renewSimulatedSubscription(subscription, clock, intervalDays);
  } else if (phaseIndex + 1 < state.phases.length) {
    phaseIndex += 1;
    phaseIteration = 1;
    const nextPhase = state.phases[phaseIndex]!;
    const periodStart = clock.now;
    const periodLength = (nextPhase.intervalDays ?? 30) * 24 * 60 * 60;
    const periodEnd = periodStart + periodLength;
    subscription = {
      ...subscription,
      cancelAtPeriodEnd: false,
      pauseCollection: null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      items: [
        {
          id: subscription.items[0]?.id ?? "si_sim_1",
          priceId: nextPhase.priceId,
          unitAmount: nextPhase.unitAmount,
        },
      ],
      status: nextPhase.trial ? "trialing" : "active",
      trialEnd: nextPhase.trial ? periodEnd : undefined,
      scheduleId: state.id,
      metadata: {
        ...subscription.metadata,
        schedulePhase: String(phaseIndex),
      },
    };
  } else {
    subscription = {
      ...subscription,
      status: "canceled",
      cancelAtPeriodEnd: false,
      pauseCollection: null,
    };
  }

  return {
    ...state,
    phaseIndex,
    phaseIteration,
    subscription,
  };
}
