import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { CartService } from '../cart/cart.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { RewardStatus } from '../loyalty/reward.entity';
import { OrderType } from './order.types';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly cartService: CartService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  /**
   * Checkout flow:
   *
   * 1. Load and validate cart (non-empty, active)
   * 2. Compute totals
   * 3. If a reward is applied, call loyalty /redeem
   * 4. Determine final discount based on redemption outcome
   * 5. Create and persist the order
   * 6. Mark cart as checked out
   *
   * Discount policy under failure:
   * - REDEEMED → full discount applied
   * - UNCERTAIN (5xx / timeout) → discount STILL applied; we accept the
   *   financial risk rather than surprise the customer with full price.
   *   The uncertain redemption is flagged for async reconciliation.
   * - FAILED (4xx) → no discount; this means the reward is no longer valid
   *   (e.g. expired between validate and checkout, or already used)
   * - Loyalty service completely down at checkout → if reward was applied
   *   to cart, we still apply the discount and mark as uncertain.
   *   Rationale: customer saw and relied on the discounted price.
   */
  async checkout(userId: string): Promise<Order> {
    const cart = await this.cartService.getActiveCart(userId);

    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cannot checkout with an empty cart');
    }

    const subtotal = this.cartService.computeSubtotal(cart);
    let discountCents = 0;
    let redemptionStatus: Order['rewardRedemptionStatus'] = 'none';
    let redemptionId: string | null = null;

    if (cart.rewardId) {
      this.logger.log(
        `Processing reward ${cart.rewardId} (${cart.rewardCode}) at checkout for user ${userId}`,
      );

      const result = await this.loyaltyService.redeemReward(
        cart.rewardId,
        `order_${uuidv4()}`, // preliminary — we create the ID here
        cart.discountCents,
        cart.rewardCode,
      );

      // Map loyalty status to order's redemption status
      switch (result.status) {
        case RewardStatus.REDEEMED:
          discountCents = cart.discountCents;
          redemptionStatus = 'redeemed';
          redemptionId = result.redemptionId;
          break;

        case RewardStatus.REDEMPTION_UNCERTAIN:
          // Apply the discount customer was shown; flag for reconciliation
          discountCents = cart.discountCents;
          redemptionStatus = 'uncertain';
          this.logger.warn(
            `Completing order with discount despite uncertain redemption. ` +
              `Reward ${cart.rewardId} needs reconciliation.`,
          );
          break;

        case RewardStatus.REDEMPTION_FAILED:
          // Don't apply discount — reward definitively rejected
          discountCents = 0;
          redemptionStatus = 'failed';
          this.logger.warn(
            `Reward ${cart.rewardId} redemption failed; completing order without discount`,
          );
          break;
      }
    }

    const totalCents = Math.max(0, subtotal - discountCents);

    // Create the order with a stable ID
    const orderId = `order_${uuidv4()}`;
    const order = this.orderRepo.create({
      id: orderId,
      userId,
      subtotalCents: subtotal,
      discountCents,
      totalCents,
      rewardCode: cart.rewardCode || null,
      redemptionId,
      rewardRedemptionStatus: redemptionStatus,
      status: OrderStatus.CONFIRMED,
      items: cart.items.map((cartItem) =>
        this.orderItemRepo.create({
          id: `oi_${uuidv4()}`,
          orderId,
          menuItemId: cartItem.menuItemId,
          name: cartItem.name,
          priceCents: cartItem.priceCents,
          quantity: cartItem.quantity,
        }),
      ),
    });

    await this.orderRepo.save(order);
    await this.cartService.markCartCheckedOut(cart.id);

    this.logger.log(
      `Order ${orderId} created for user ${userId}. ` +
        `Total: ${totalCents} (subtotal: ${subtotal}, discount: ${discountCents}). ` +
        `Reward status: ${redemptionStatus}`,
    );

    return order;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return order;
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  toOrderType(order: Order): OrderType {
    return {
      id: order.id,
      userId: order.userId,
      items: (order.items || []).map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        priceCents: item.priceCents,
        quantity: item.quantity,
        subtotalCents: item.priceCents * item.quantity,
      })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      rewardCode: order.rewardCode,
      redemptionId: order.redemptionId,
      rewardRedemptionStatus: order.rewardRedemptionStatus,
      status: order.status,
      createdAt: order.createdAt,
    };
  }
}
