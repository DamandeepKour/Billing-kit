import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { createRawBodyMiddleware } from "billing-kit";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  providers: [BillingService],
  controllers: [BillingController, WebhooksController],
  exports: [BillingService],
})
export class BillingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(createRawBodyMiddleware())
      .forRoutes(
        { path: "billing/webhooks/stripe", method: RequestMethod.POST },
        { path: "billing/webhooks/razorpay", method: RequestMethod.POST },
      );
  }
}
