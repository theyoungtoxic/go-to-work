import { createServer } from "node:http";

import { createHttpServer } from "./api/http-server.js";
import { GoToWorkService } from "./core/service.js";

async function main(): Promise<void> {
  const service = new GoToWorkService();
  await service.start();
  const app = await createHttpServer(service);
  const server = createServer(app);

  server.listen(service.policy.general.port, service.policy.general.host, () => {
    const address = `http://${service.policy.general.host}:${service.policy.general.port}`;
    process.stdout.write(`GO TO WORK server listening on ${address}\n`);
    process.stdout.write(`Auth secret: ${service.authSecret}\n`);
    process.stdout.write(`Auth secret stored at: ${service.paths.authSecretFile}\n`);
  });

  const shutdown = async () => {
    server.close();
    await service.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
