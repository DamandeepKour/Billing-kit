import {
  Controller,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { BillingService } from "./billing.service";

/**
 * Expects raw Buffer body on webhook routes (see BillingModule.configure
 * and main.ts). Do not apply a global JSON parser to these paths.
 */
@Controller("billing/webhooks")
export class WebhooksController {
  constructor(private readonly billing: BillingService) {}

  @Post("stripe")
  async stripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ): Promise<void> {
    await this.handle(req, res);
  }

  @Post("razorpay")
  async razorpay(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ): Promise<void> {
    await this.handle(req, res);
  }

  private async handle(
    req: Request & { rawBody?: Buffer },
    res: Response,
  ): Promise<void> {
    try {
      if (!Buffer.isBuffer(req.body) && Buffer.isBuffer(req.rawBody)) {
        req.body = req.rawBody;
      }

      const result = await this.billing.processWebhookFromHttp(req);
      if (result.duplicate) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook error";
      res.status(400).json({ error: message });
    }
  }
}
