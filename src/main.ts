import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // Allow CORS for local development
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Checkout service running at http://localhost:${port}/graphql`);
  logger.log(
    `🔗 Loyalty service: ${process.env.LOYALTY_SERVICE_URL || 'http://localhost:3001'}`,
  );
}

bootstrap();
