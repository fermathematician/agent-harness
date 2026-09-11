import { createDashboardServer } from "./dashboard-ui.ts";

const port = Number(process.env.PORT ?? 3000);
const server = createDashboardServer();

server.listen(port, "127.0.0.1", () => {
  console.log(`Dashboard running at http://127.0.0.1:${port}`);
});
