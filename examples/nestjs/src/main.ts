import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  /**
   * rawBody: true makes Nest preserve the raw buffer on req.rawBody
   * (Nest 8+). Combined with BillingModule's createRawBodyMiddleware on
   * webhook routes, signature verification receives the exact bytes.
   */
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // JSON parsing is fine globally when webhook routes use raw-body middleware first.
  app.useBodyParser("json");

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`billing-kit NestJS example listening on :${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
