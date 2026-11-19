import express from "express";
import { browserAccessControl } from "./middleware/browserAccess.js";
import path from "path";
import fs from "fs";
import { env } from "./config/env.js";

import projectsRouter from "./routes/projects.routes.js";
import processRouter from "./routes/process.routes.js";
import cutsRouter from "./routes/cuts.routes.js";
import brollRouter from "./routes/broll.routes.js";
import exportRouter from "./routes/export.routes.js";
import settingsRouter from "./routes/settings.routes.js";
import mediaRouter from "./routes/media.routes.js";

const app = express();
const PORT = env.PORT;

app.use(browserAccessControl(process.env.KARKASCUT_ALLOWED_ORIGINS));
app.use(express.json());

// Mount route modules
app.use(mediaRouter);
app.use(settingsRouter);
app.use(projectsRouter);
app.use(processRouter);
app.use(cutsRouter);
app.use(brollRouter);
app.use(exportRouter);

// Static client bundle for production
const clientDist = path.resolve(process.cwd(), "dist/client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/media")) {
      return res.sendFile(path.join(clientDist, "index.html"));
    }
    next();
  });
}

export const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
