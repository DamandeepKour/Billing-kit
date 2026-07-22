import type {
  ConsoleLoggerOptions,
  LogLevel,
  Logger,
  StructuredLogFields,
} from "../types/observability";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class NoopLogger implements Logger {
  debug(_message?: string, _fields?: StructuredLogFields): void {}
  info(_message?: string, _fields?: StructuredLogFields): void {}
  warn(_message?: string, _fields?: StructuredLogFields): void {}
  error(_message?: string, _fields?: StructuredLogFields): void {}
  child(): Logger {
    return this;
  }
}

/** Structured logger that writes JSON lines (or text) to a destination. */
export class ConsoleLogger implements Logger {
  private readonly json: boolean;
  private readonly minLevel: LogLevel;
  private readonly destination: { write(chunk: string): void };
  private readonly bindings: StructuredLogFields;

  constructor(
    options: ConsoleLoggerOptions = {},
    bindings: StructuredLogFields = {},
  ) {
    this.json = options.json ?? true;
    this.minLevel = options.minLevel ?? "info";
    this.destination = options.destination ?? {
      write: (chunk) => {
        process.stdout.write(chunk);
      },
    };
    this.bindings = bindings;
  }

  child(bindings: StructuredLogFields): Logger {
    return new ConsoleLogger(
      {
        json: this.json,
        minLevel: this.minLevel,
        destination: this.destination,
      },
      { ...this.bindings, ...bindings },
    );
  }

  debug(message: string, fields?: StructuredLogFields): void {
    this.write("debug", message, fields);
  }
  info(message: string, fields?: StructuredLogFields): void {
    this.write("info", message, fields);
  }
  warn(message: string, fields?: StructuredLogFields): void {
    this.write("warn", message, fields);
  }
  error(message: string, fields?: StructuredLogFields): void {
    this.write("error", message, fields);
  }

  private write(
    level: LogLevel,
    message: string,
    fields?: StructuredLogFields,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const entry = {
      level,
      msg: message,
      time: new Date().toISOString(),
      ...this.bindings,
      ...fields,
    };
    if (this.json) {
      this.destination.write(`${JSON.stringify(entry)}\n`);
      return;
    }
    const { level: lvl, msg, time, ...rest } = entry;
    this.destination.write(
      `${time} ${lvl.toUpperCase()} ${msg} ${JSON.stringify(rest)}\n`,
    );
  }
}
