/**
 * Prints the authorization matrix for every registered route, from the
 * application Nest actually builds (SRS RBAC 010, audit evidence).
 *
 *   pnpm --filter api routes:matrix            # markdown table on stdout
 *   pnpm --filter api routes:matrix --json     # machine-readable
 *
 * It reads the same `Reflector` metadata the guard reads, rather than scanning
 * source: decorator order in a file says nothing about what the guard sees, and
 * a static scan mis-attributes it. A row reading NONE is a route the default-deny
 * guard refuses at runtime — safe, but a programming error to be fixed.
 */
import { NestFactory, Reflector } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { API_PREFIX } from '../app.setup.js';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY, PUBLIC_ROUTE_KEY, SESSION_ONLY_KEY } from '../auth/decorators.js';
import { isActivePermissionKey } from '../identity/permissions.js';

interface RouteRow {
  method: string;
  path: string;
  authorization: string;
  controller: string;
  handler: string;
}

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

const join = (...parts: (string | undefined)[]): string =>
  `/${parts.filter((part) => part !== undefined && part !== '' && part !== '/').map((part) => String(part).replace(/^\/+|\/+$/g, '')).join('/')}`;

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, abortOnError: false });
  const reflector = app.get(Reflector);

  const rows: RouteRow[] = [];
  const container = (app as unknown as { container: { getModules(): Map<string, { controllers: Map<unknown, { instance: object; metatype?: new (...args: never[]) => object }> }> } }).container;
  for (const module of container.getModules().values()) {
    for (const wrapper of module.controllers.values()) {
      const metatype = wrapper.metatype;
      if (!metatype) continue;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined;
      const prototype = Object.getPrototypeOf(wrapper.instance);
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === 'constructor') continue;
        const handler = prototype[name] as ((...args: never[]) => unknown) | undefined;
        if (typeof handler !== 'function') continue;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        // No route metadata: a helper on the controller, not an endpoint.
        if (methodPath === undefined || requestMethod === undefined) continue;

        // Exactly what PermissionsGuard reads: handler first, then the class,
        // so a controller-level declaration is attributed to its routes.
        const targets = [handler, metatype] as Parameters<Reflector['getAllAndOverride']>[1];
        const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets);
        const sessionOnly = reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets);
        const permissions = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
        const anyOf = reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets);
        // A retired or unknown code on a route is refused at runtime; flag it here so it is fixed before deploy.
        const retired = [...(permissions ?? []), ...(anyOf ?? [])].filter((code) => !isActivePermissionKey(code));
        rows.push({
          method: METHOD_NAMES[requestMethod] ?? String(requestMethod),
          path: join(API_PREFIX, controllerPath, methodPath),
          authorization: `${isPublic ? 'PUBLIC' : anyOf?.length ? anyOf.join(' | ') : permissions?.length ? permissions.join(' + ') : sessionOnly ? 'SESSION ONLY' : 'NONE'}${retired.length ? ` RETIRED(${retired.join(', ')})` : ''}`,
          controller: metatype.name,
          handler: name,
        });
      }
    }
  }
  rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    const admin = rows.filter((row) => row.path.startsWith('/api/v1/admin'));
    const publicRoutes = rows.filter((row) => !row.path.startsWith('/api/v1/admin'));
    process.stdout.write('| Method | Route | Required authorization | Controller |\n| --- | --- | --- | --- |\n');
    for (const row of admin) process.stdout.write(`| ${row.method} | \`${row.path}\` | ${row.authorization === 'NONE' ? '**NONE**' : `\`${row.authorization}\``} | ${row.controller} |\n`);
    process.stdout.write('\n### Routes outside /api/v1/admin\n\n| Method | Route | Controller |\n| --- | --- | --- |\n');
    for (const row of publicRoutes) process.stdout.write(`| ${row.method} | \`${row.path}\` | ${row.controller} |\n`);
    const none = admin.filter((row) => row.authorization === 'NONE' || row.authorization === 'UNRESOLVED');
    process.stdout.write(`\n**Totals:** ${admin.length} admin routes, ${publicRoutes.length} outside the admin prefix, ${none.length} without a resolved declaration.\n`);
    if (none.length > 0) for (const row of none) process.stdout.write(`- ${row.method} ${row.path} → ${row.authorization}\n`);
  }
  await app.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`[routes:matrix] failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
