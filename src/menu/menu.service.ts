import { Injectable, NotFoundException } from '@nestjs/common';
import { MenuItem } from './menu.types';

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'item_001',
    name: 'Classic Burger',
    description: 'Beef patty, lettuce, tomato, pickles, special sauce',
    priceCents: 1299,
    category: 'Burgers',
    available: true,
  },
  {
    id: 'item_002',
    name: 'Veggie Burger',
    description: 'Plant-based patty with all the fixings',
    priceCents: 1199,
    category: 'Burgers',
    available: true,
  },
  {
    id: 'item_003',
    name: 'Margherita Pizza',
    description: 'Fresh tomato, mozzarella, basil on house-made dough',
    priceCents: 1599,
    category: 'Pizza',
    available: true,
  },
  {
    id: 'item_004',
    name: 'Pepperoni Pizza',
    description: 'Loaded with pepperoni and mozzarella',
    priceCents: 1799,
    category: 'Pizza',
    available: true,
  },
  {
    id: 'item_005',
    name: 'Caesar Salad',
    description: 'Romaine, croutons, parmesan, house caesar dressing',
    priceCents: 999,
    category: 'Salads',
    available: true,
  },
  {
    id: 'item_006',
    name: 'French Fries',
    description: 'Crispy golden fries with sea salt',
    priceCents: 499,
    category: 'Sides',
    available: true,
  },
  {
    id: 'item_007',
    name: 'Onion Rings',
    description: 'Beer-battered onion rings',
    priceCents: 599,
    category: 'Sides',
    available: true,
  },
  {
    id: 'item_008',
    name: 'Chocolate Milkshake',
    description: 'Hand-spun with premium ice cream',
    priceCents: 799,
    category: 'Drinks',
    available: true,
  },
  {
    id: 'item_009',
    name: 'Grilled Chicken Sandwich',
    description: 'Grilled chicken breast with avocado and sriracha mayo',
    priceCents: 1399,
    category: 'Sandwiches',
    available: true,
  },
  {
    id: 'item_010',
    name: 'Fish Tacos (3)',
    description: 'Beer-battered cod with slaw and chipotle crema',
    priceCents: 1499,
    category: 'Tacos',
    available: true,
  },
];

@Injectable()
export class MenuService {
  getAll(): MenuItem[] {
    return MENU_ITEMS.filter((item) => item.available);
  }

  getById(id: string): MenuItem {
    const item = MENU_ITEMS.find((i) => i.id === id);
    if (!item) {
      throw new NotFoundException(`Menu item ${id} not found`);
    }
    if (!item.available) {
      throw new NotFoundException(`Menu item ${id} is unavailable`);
    }
    return item;
  }

  getByCategory(category: string): MenuItem[] {
    return MENU_ITEMS.filter(
      (item) =>
        item.available &&
        item.category.toLowerCase() === category.toLowerCase(),
    );
  }

  getCategories(): string[] {
    const categories = new Set(MENU_ITEMS.map((item) => item.category));
    return Array.from(categories);
  }
}
