import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { Cart, CartStatus } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { MenuService } from '../menu/menu.service';

// Mock menu item for testing
const mockMenuItem = {
  id: 'item_001',
  name: 'Classic Burger',
  description: 'A burger',
  priceCents: 1299,
  category: 'Burgers',
  available: true,
};

const makeCart = (overrides: Partial<Cart> = {}): Cart => ({
  id: 'cart_test_123',
  userId: 'user_1',
  status: CartStatus.ACTIVE,
  rewardCode: null,
  rewardId: null,
  discountCents: null,
  isPercentageDiscount: false,
  discountPercent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [],
  ...overrides,
});

describe('CartService', () => {
  let service: CartService;
  let cartRepo: jest.Mocked<any>;
  let cartItemRepo: jest.Mocked<any>;
  let menuService: jest.Mocked<MenuService>;

  beforeEach(async () => {
    cartRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    cartItemRepo = {
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    menuService = {
      getById: jest.fn(),
      getAll: jest.fn(),
      getByCategory: jest.fn(),
      getCategories: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: cartRepo },
        { provide: getRepositoryToken(CartItem), useValue: cartItemRepo },
        { provide: MenuService, useValue: menuService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  describe('computeSubtotal', () => {
    it('sums priceCents * quantity for all items', () => {
      const cart = makeCart({
        items: [
          {
            id: 'ci_1',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_001',
            name: 'Burger',
            priceCents: 1299,
            quantity: 2,
          },
          {
            id: 'ci_2',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_006',
            name: 'Fries',
            priceCents: 499,
            quantity: 1,
          },
        ],
      });
      expect(service.computeSubtotal(cart)).toBe(2 * 1299 + 499); // 3097
    });

    it('returns 0 for empty cart', () => {
      const cart = makeCart({ items: [] });
      expect(service.computeSubtotal(cart)).toBe(0);
    });
  });

  describe('computeTotal', () => {
    it('applies discount to subtotal', () => {
      const cart = makeCart({
        items: [
          {
            id: 'ci_1',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_001',
            name: 'Burger',
            priceCents: 1299,
            quantity: 1,
          },
        ],
        discountCents: 500,
      });
      expect(service.computeTotal(cart)).toBe(799);
    });

    it('does not go below zero', () => {
      const cart = makeCart({
        items: [
          {
            id: 'ci_1',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_001',
            name: 'Burger',
            priceCents: 499,
            quantity: 1,
          },
        ],
        discountCents: 1000, // discount > subtotal
      });
      expect(service.computeTotal(cart)).toBe(0);
    });

    it('returns subtotal when no discount applied', () => {
      const cart = makeCart({
        items: [
          {
            id: 'ci_1',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_001',
            name: 'Burger',
            priceCents: 1299,
            quantity: 1,
          },
        ],
        discountCents: null,
      });
      expect(service.computeTotal(cart)).toBe(1299);
    });
  });

  describe('addItem', () => {
    it('throws BadRequestException for quantity <= 0', async () => {
      await expect(
        service.addItem('user_1', 'item_001', 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new cart if none exists', async () => {
      menuService.getById.mockReturnValue(mockMenuItem);
      cartRepo.findOne.mockResolvedValueOnce(null); // no active cart

      const newCart = makeCart();
      cartRepo.create.mockReturnValue(newCart);
      cartRepo.save.mockResolvedValue(newCart);
      cartItemRepo.create.mockReturnValue({
        id: 'ci_new',
        menuItemId: 'item_001',
        priceCents: 1299,
        quantity: 1,
        name: 'Classic Burger',
      });
      cartItemRepo.save.mockResolvedValue({});
      // Second findOne returns cart with item
      cartRepo.findOne.mockResolvedValueOnce({
        ...newCart,
        items: [{ id: 'ci_new', menuItemId: 'item_001', priceCents: 1299, quantity: 1 }],
      });

      const result = await service.addItem('user_1', 'item_001', 1);
      expect(cartRepo.create).toHaveBeenCalled();
      expect(cartItemRepo.create).toHaveBeenCalled();
    });
  });

  describe('toCartType', () => {
    it('correctly maps cart to CartType with reward', () => {
      const cart = makeCart({
        rewardCode: 'SAVE500',
        discountCents: 500,
        items: [
          {
            id: 'ci_1',
            cartId: 'cart_test_123',
            cart: null,
            menuItemId: 'item_001',
            name: 'Burger',
            priceCents: 1299,
            quantity: 1,
          },
        ],
      });

      const result = service.toCartType(cart);
      expect(result.subtotalCents).toBe(1299);
      expect(result.totalCents).toBe(799);
      expect(result.appliedReward).toEqual({ code: 'SAVE500', discountCents: 500 });
      expect(result.items[0].subtotalCents).toBe(1299);
    });

    it('returns null appliedReward when no reward', () => {
      const cart = makeCart({ items: [] });
      const result = service.toCartType(cart);
      expect(result.appliedReward).toBeNull();
    });
  });
});
