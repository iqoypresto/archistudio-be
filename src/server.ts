import { app } from "./app.js";
import { env } from "./configs/env.config.js";
import { logger } from "./configs/logger.config.js";

app.listen(env.PORT, () => {
  logger.info(`ArchiStudio Backend berjalan pada port ${env.PORT} (${env.NODE_ENV})`);
});
