import { JSONSchemaType } from "ajv";

export interface ReqBody {
	email?: string;
	phoneNumber?: string;
}

export const jsonSchema: JSONSchemaType<ReqBody> = {
  type: "object",
  anyOf: [
    {
      required: ["email"],
      properties: {
        email: { type: "string" },
      },
    },
    {
      required: ["phoneNumber"],
      properties: {
        phoneNumber: { type: "string" },
      },
    },
  ],
  minProperties: 1,
};
