import { Resolver, Query, Args } from '@nestjs/graphql';
import { MenuService } from './menu.service';
import { MenuItem } from './menu.types';

@Resolver(() => MenuItem)
export class MenuResolver {
  constructor(private readonly menuService: MenuService) {}

  @Query(() => [MenuItem], { description: 'Browse all available menu items' })
  menu(): MenuItem[] {
    return this.menuService.getAll();
  }

  @Query(() => MenuItem, { description: 'Get a single menu item by ID' })
  menuItem(@Args('id') id: string): MenuItem {
    return this.menuService.getById(id);
  }

  @Query(() => [MenuItem], {
    description: 'Browse menu items by category',
    nullable: true,
  })
  menuByCategory(@Args('category') category: string): MenuItem[] {
    return this.menuService.getByCategory(category);
  }

  @Query(() => [String], { description: 'List all menu categories' })
  menuCategories(): string[] {
    return this.menuService.getCategories();
  }
}
