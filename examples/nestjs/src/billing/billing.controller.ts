import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { BillingKitError } from "billing-kit";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("health")
  health() {
    return this.billing.healthCheck();
  }

  @Post("payments")
  async createPayment(
    @Body()
    body: {
      amount: number;
      currency?: string;
      customerId?: string;
      description?: string;
      metadata?: Record<string, string>;
    },
  ) {
    try {
      if (typeof body?.amount !== "number" || body.amount <= 0) {
        throw new HttpException(
          "amount (positive integer, smallest units) is required",
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.billing.createPayment(body);
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get("payments/:id")
  async paymentStatus(@Param("id") id: string) {
    try {
      return await this.billing.getPaymentStatus(id);
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post("invoices")
  async createInvoice(
    @Body()
    body: {
      customer: { name: string; email?: string };
      billingAddress?: Record<string, string>;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitAmount: number;
      }>;
      notes?: string;
    },
  ) {
    try {
      if (!body?.customer?.name || !Array.isArray(body.lineItems)) {
        throw new HttpException(
          "customer.name and lineItems[] are required",
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.billing.generateInvoice(body as never);
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get("invoices/:id")
  async getInvoice(@Param("id") id: string) {
    try {
      const invoice = await this.billing.getInvoice(id);
      if (!invoice) {
        throw new HttpException("Invoice not found", HttpStatus.NOT_FOUND);
      }
      return invoice;
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post("refunds")
  async refund(
    @Body()
    body: {
      paymentId: string;
      amount?: number;
      reason?: string;
      idempotencyKey?: string;
      metadata?: Record<string, string>;
    },
  ) {
    try {
      if (!body?.paymentId) {
        throw new HttpException("paymentId is required", HttpStatus.BAD_REQUEST);
      }
      return await this.billing.refundPayment(body);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof BillingKitError) {
      throw new HttpException(
        { code: error.code, message: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new HttpException(
      error instanceof Error ? error.message : "Unknown error",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
