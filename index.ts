import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import { identifyRoute } from "./helpers";

const app: Express = express();

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const PORT = 3001;

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world");
});

app.post("/identify", async (req: Request, res: Response) => {
  let response = null;
  try {
    response = await identifyRoute(req.body);
  } catch (error) {
    res.status(500).send(`Error: ${error}`);
		return;
	}
  res.json(response);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
