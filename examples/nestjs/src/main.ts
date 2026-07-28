import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  /**
   * rawBody: true (Nest 8+) preserves req.rawBody.
   * BillingModule also mounts createRawBodyMiddleware on webhook paths so
   * HMAC / Stripe signature verification sees the exact request bytes.
   */
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`billing-kit NestJS example listening on :${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
