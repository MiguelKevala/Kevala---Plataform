# Kevala

Plataforma web empresarial de uso interno. Monolito modular (Next.js + TypeScript + PostgreSQL/Prisma + Tailwind CSS).

La especificación funcional y técnica de referencia es `KevalaV1.pdf` (raíz del repo) — fuente de verdad para el alcance de V1.

## Estado

Fase 0 (scaffolding) completada. Sin base de datos conectada todavía, sin modelos Prisma definidos, sin autenticación ni módulo Vendor implementados.

## Requisitos

- Node.js 24 LTS (o el gestionado vía `nvm`)
- PostgreSQL (no configurado aún)

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Base de datos

Copia `.env.example` a `.env` y completa `DATABASE_URL` cuando haya una instancia de PostgreSQL disponible. El esquema de Prisma (`prisma/schema.prisma`) está inicializado pero sin modelos: se define y se revisa antes de correr cualquier migración.

## Estructura

```
src/
  app/          rutas Next.js (App Router)
  modules/      lógica de negocio por dominio (auth, users, rbac, audit, vendor)
  components/   design system reutilizable (ui/, layout/)
  lib/          utilidades transversales
  types/        tipos compartidos
prisma/         esquema y migraciones
tests/          unit/ e integration/
```
