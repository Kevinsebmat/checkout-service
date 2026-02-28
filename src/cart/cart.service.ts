import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Cart, CartStatus } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { MenuService } from '../menu/menu.service';
import { CartType, CartItemType, AppliedReward } from './cart.types';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    private readonly menuService: MenuService,
  ) {}

  async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepo.create({
        id: `cart_${uuidv4()}`,
        userId,
        status: CartStatus.ACTIVE,
        items: [],
      });
      await this.cartRepo.save(cart);
    }

    return cart;
  }

  async getCart(userId: string): Promise<Cart | null> {
    return this.cartRepo.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: ['items'],
    });
  }

  async addItem(
    userId: string,
    menuItemId: string,
    quantity: number,
  ): Promise<Cart> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    console.log('addItem called with:', userId, menuItemId, quantity);
    const menuItem = await this.menuService.getById(menuItemId);
    const cart = await this.getOrCreateCart(userId);

    // Check if item already in cart
    const existing = cart.items.find((i) => i.menuItemId === menuItemId);
    if (existing) {
      existing.quantity += quantity;
      await this.cartItemRepo.save(existing);
    } else {
      const cartItem = this.cartItemRepo.create({
        id: `ci_${uuidv4()}`,
        cartId: cart.id,
        menuItemId: menuItem.id,
        name: menuItem.name,
        priceCents: menuItem.priceCents,
        quantity,
      });
      await this.cartItemRepo.save(cartItem);
      cart.items.push(cartItem);
    }

    // Invalidate any applied reward when cart changes - the discount
    // amount may no longer be accurate (e.g. PERCENT20 or MINIMUM50)
    if (cart.rewardId) {
      await this.clearReward(cart);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    });
  }

  async removeItem(userId: string, menuItemId: string): Promise<Cart> {
    const cart = await this.getActiveCart(userId);

    const item = cart.items.find((i) => i.menuItemId === menuItemId);
    if (!item) {
      throw new NotFoundException(`Item ${menuItemId} not found in cart`);
    }

    await this.cartItemRepo.remove(item);

    // Invalidate reward on cart change
    if (cart.rewardId) {
      await this.clearReward(cart);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    });
  }

  async updateItemQuantity(
    userId: string,
    menuItemId: string,
    quantity: number,
  ): Promise<Cart> {
    if (quantity <= 0) {
      return this.removeItem(userId, menuItemId);
    }

    const cart = await this.getActiveCart(userId);
    const item = cart.items.find((i) => i.menuItemId === menuItemId);
    if (!item) {
      throw new NotFoundException(`Item ${menuItemId} not found in cart`);
    }

    item.quantity = quantity;
    await this.cartItemRepo.save(item);

    if (cart.rewardId) {
      await this.clearReward(cart);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    });
  }

  async applyReward(
    userId: string,
    rewardCode: string,
    rewardId: string,
    discountCents: number,
  ): Promise<Cart> {
    const cart = await this.getActiveCart(userId);

    cart.rewardCode = rewardCode;
    cart.rewardId = rewardId;
    cart.discountCents = discountCents;

    await this.cartRepo.save(cart);
    return cart;
  }

  async clearRewardByUserId(userId: string): Promise<void> {
    const cart = await this.getActiveCart(userId);
    await this.clearReward(cart);
  }

  private async clearReward(cart: Cart): Promise<void> {
    cart.rewardCode = null;
    cart.rewardId = null;
    cart.discountCents = null;
    await this.cartRepo.save(cart);
  }

  async getActiveCart(userId: string): Promise<Cart> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: ['items'],
    });
    if (!cart) {
      throw new NotFoundException(
        'No active cart found. Add an item to start a cart.',
      );
    }
    return cart;
  }

  async markCartCheckedOut(cartId: string): Promise<void> {
    await this.cartRepo.update(cartId, { status: CartStatus.CHECKED_OUT });
  }

  computeSubtotal(cart: Cart): number {
    return cart.items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );
  }

  computeTotal(cart: Cart): number {
    const subtotal = this.computeSubtotal(cart);
    const discount = cart.discountCents ?? 0;
    return Math.max(0, subtotal - discount);
  }

  toCartType(cart: Cart): CartType {
    const subtotal = this.computeSubtotal(cart);
    const discount = cart.discountCents ?? 0;
    const total = Math.max(0, subtotal - discount);

    return {
      id: cart.id,
      userId: cart.userId,
      items: (cart.items || []).map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        priceCents: item.priceCents,
        quantity: item.quantity,
        subtotalCents: item.priceCents * item.quantity,
      })),
      subtotalCents: subtotal,
      appliedReward: cart.rewardCode
        ? { code: cart.rewardCode, discountCents: discount }
        : null,
      totalCents: total,
    };
  }
}
