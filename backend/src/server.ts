import { app } from "./app.js";
import "dotenv/config";

const port = Number(process.env.PORT ?? 3333);

app.listen(port, () => {
  console.log(`HTTP server running on ${port}`);
});
