import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { CartService } from '../cart/cart.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { Cart, CartStatus } from '../cart/cart.entity';
import { RewardStatus } from '../loyalty/reward.entity';

const makeCart = (overrides: Partial<Cart> = {}): Cart => ({
  id: 'cart_123',
  userId: 'user_1',
  status: CartStatus.ACTIVE,
  rewardCode: null,
  rewardId: null,
  discountCents: null,
  isPercentageDiscount: false,
  discountPercent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'ci_1',
      cartId: 'cart_123',
      cart: null,
      menuItemId: 'item_001',
      name: 'Classic Burger',
      priceCents: 1299,
      quantity: 2,
    },
  ],
  ...overrides,
});

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<any>;
  let orderItemRepo: jest.Mocked<any>;
  let cartService: jest.Mocked<CartService>;
  let loyaltyService: jest.Mocked<LoyaltyService>;

  beforeEach(async () => {
    orderRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((order) => Promise.resolve(order)),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    orderItemRepo = {
      create: jest.fn().mockImplementation((data) => data),
    };

    cartService = {
      getActiveCart: jest.fn(),
      computeSubtotal: jest.fn(),
      markCartCheckedOut: jest.fn().mockResolvedValue(undefined),
    } as any;

    loyaltyService = {
      redeemReward: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: CartService, useValue: cartService },
        { provide: LoyaltyService, useValue: loyaltyService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('checkout', () => {
    it('throws BadRequestException for empty cart', async () => {
      cartService.getActiveCart.mockResolvedValue(makeCart({ items: [] }));
      await expect(service.checkout('user_1')).rejects.toThrow(BadRequestException);
    });

    it('creates order without discount when no reward applied', async () => {
      const cart = makeCart();
      cartService.getActiveCart.mockResolvedValue(cart);
      cartService.computeSubtotal.mockReturnValue(2598); // 2 x 1299

      await service.checkout('user_1');

      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotalCents: 2598,
          discountCents: 0,
          totalCents: 2598,
          rewardRedemptionStatus: 'none',
        }),
      );
      expect(loyaltyService.redeemReward).not.toHaveBeenCalled();
    });

    it('applies full discount when reward is successfully redeemed', async () => {
      const cart = makeCart({ rewardId: 'rwd_abc', rewardCode: 'SAVE500', discountCents: 500 });
      cartService.getActiveCart.mockResolvedValue(cart);
      cartService.computeSubtotal.mockReturnValue(2598);
      loyaltyService.redeemReward.mockResolvedValue({
        redemptionId: 'rdm_xyz',
        status: RewardStatus.REDEEMED,
      });

      await service.checkout('user_1');

      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotalCents: 2598,
          discountCents: 500,
          totalCents: 2098,
          rewardRedemptionStatus: 'redeemed',
        }),
      );
    });

    it('still applies discount when redemption is UNCERTAIN (customer-first policy)', async () => {
      const cart = makeCart({ rewardId: 'rwd_abc', rewardCode: 'SAVE500', discountCents: 500 });
      cartService.getActiveCart.mockResolvedValue(cart);
      cartService.computeSubtotal.mockReturnValue(2598);
      loyaltyService.redeemReward.mockResolvedValue({
        redemptionId: null,
        status: RewardStatus.REDEMPTION_UNCERTAIN,
      });

      await service.checkout('user_1');

      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          discountCents: 500,
          totalCents: 2098,
          rewardRedemptionStatus: 'uncertain',
        }),
      );
    });

    it('does NOT apply discount when redemption definitively fails (4xx)', async () => {
      const cart = makeCart({ rewardId: 'rwd_abc', rewardCode: 'SAVE500', discountCents: 500 });
      cartService.getActiveCart.mockResolvedValue(cart);
      cartService.computeSubtotal.mockReturnValue(2598);
      loyaltyService.redeemReward.mockResolvedValue({
        redemptionId: null,
        status: RewardStatus.REDEMPTION_FAILED,
      });

      await service.checkout('user_1');

      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          discountCents: 0,
          totalCents: 2598,
          rewardRedemptionStatus: 'failed',
        }),
      );
    });

    it('marks cart as checked out after successful order', async () => {
      const cart = makeCart();
      cartService.getActiveCart.mockResolvedValue(cart);
      cartService.computeSubtotal.mockReturnValue(2598);

      await service.checkout('user_1');

      expect(cartService.markCartCheckedOut).toHaveBeenCalledWith(cart.id);
    });
  });
});
