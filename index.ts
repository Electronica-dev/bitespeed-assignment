import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import { identify } from "./routes/identify";

const app: Express = express();

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const port = process.env.PORT ?? 3001;

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world");
});

app.post("/identify", async (req: Request, res: Response) => {
  let response = null;
  try {
    response = await identify(req.body);
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send(`Error: ${error}`);
    return;
  }
  res.json(response);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
