import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { MenuModule } from './menu/menu.module';
import { CartModule } from './cart/cart.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { OrderModule } from './order/order.module';

@Module({
  imports: [
    DatabaseModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      context: ({ req }) => ({ req }),
      playground: true,
      introspection: true,
    }),
    MenuModule,
    CartModule,
    LoyaltyModule,
    OrderModule,
  ],
})
export class AppModule {}
