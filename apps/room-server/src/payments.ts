import Stripe from "stripe";
import { findCoinPack } from "@afro-party/game-core";
import type { ProfileService } from "./profile-service.js";

export interface PaymentsConfig {
  secretKey: string;
  webhookSecret: string;
  /** Public URL of the web app, for Stripe's success/cancel redirects. */
  webUrl: string;
}

export type WebhookOutcome = "credited" | "duplicate" | "ignored" | "invalid_signature" | "unknown_profile_or_pack";

/**
 * Coin packs via Stripe Checkout (hosted payment page). Coins are only credited
 * from the signed webhook, never from the browser redirect, so a user can't
 * fake a purchase by visiting the success URL.
 */
export class Payments {
  private readonly stripe: Stripe;

  constructor(
    private readonly config: PaymentsConfig,
    private readonly profiles: ProfileService,
  ) {
    this.stripe = new Stripe(config.secretKey);
  }

  /**
   * @param idempotencyKey forwarded to Stripe, so a retried request returns the same
   *   Checkout Session instead of creating a second one.
   */
  async createCheckout(profileId: string, packId: string, idempotencyKey?: string): Promise<string | null> {
    const pack = findCoinPack(packId);
    if (!pack) return null;
    const session = await this.stripe.checkout.sessions.create(
      {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: pack.pricePence,
            product_data: { name: `${pack.coins.toLocaleString("en-GB")} coins · ${pack.name}` },
          },
        },
      ],
      client_reference_id: profileId,
      metadata: { profileId, packId: pack.id },
      success_url: `${this.config.webUrl}/shop?purchase=success`,
      cancel_url: `${this.config.webUrl}/shop?purchase=cancelled`,
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return session.url;
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
    if (!signature) return "invalid_signature";
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    } catch {
      return "invalid_signature";
    }
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
      return "ignored";
    }
    const session = event.data.object;
    if (session.payment_status !== "paid") return "ignored"; // async methods settle later
    const profileId = session.metadata?.profileId;
    const packId = session.metadata?.packId;
    if (!profileId || !packId) return "unknown_profile_or_pack";
    const result = await this.profiles.creditCoinPack(profileId, packId, session.id);
    return result === "unknown" ? "unknown_profile_or_pack" : result;
  }

  /** Test helper: a correctly signed header for a payload. */
  signForTest(payload: string): string {
    return this.stripe.webhooks.generateTestHeaderString({ payload, secret: this.config.webhookSecret });
  }
}
