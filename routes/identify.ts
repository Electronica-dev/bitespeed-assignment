import { PrismaClient, Prisma, Contact } from "@prisma/client";
import Ajv from "ajv";
import { jsonSchema } from "../constants";
import { buildResponseBody, buildSingleContactResponseBody } from "../helpers";

export interface IdentifyRouteResBody {
  contact: {
    primaryContactId: number;
    emails: string[]; // first element being email of primary contact
    phoneNumbers: string[]; // first element being phoneNumber of primary contact
    secondaryContactIds: number[]; // Array of all Contact IDs that are "secondary" to the primary contact
  };
}

const ajv = new Ajv();
const validate = ajv.compile(jsonSchema);

const prisma = new PrismaClient();

const identify = async (reqBody: JSON) => {
  const valid = validate(reqBody);

  if (!valid) {
    throw new Error("JSON is not valid. Please recheck.");
  }

  const email = reqBody.email ?? null;
  const phoneNumber = reqBody.phoneNumber ?? null;
  let emailOrPhoneInDb: Contact[] = [];

  if (email) {
    try {
      emailOrPhoneInDb = await prisma.contact.findMany({
        where: {
          email,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      throw new Error(`Unable to find contact with email ${email}: ${error}`);
    }
  } else {
    try {
      emailOrPhoneInDb = await prisma.contact.findMany({
        where: {
          phoneNumber,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      throw new Error(
        `Unable to find contact with phoneNumber ${phoneNumber}: ${error}`
      );
    }
  }

  if (emailOrPhoneInDb.length !== 0 && email && phoneNumber) {
    const singleContact: Contact | null = await prisma.contact.findFirst({
      where: {
        email,
        phoneNumber,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (singleContact) {
      // There is already a Contact in the DB with the following details so there is no need to create a secondary contact
      if (singleContact.linkPrecedence === "primary") {
        const response: IdentifyRouteResBody = await buildResponseBody(
          singleContact
        );
        return response;
      } else {
        let primaryContact: Contact;

        if (!singleContact.linkedId) {
          throw new Error("Secondary contact linked id is empty");
        }

        try {
          primaryContact = await prisma.contact.findUniqueOrThrow({
            where: {
              id: singleContact.linkedId,
            },
          });
        } catch (error) {
          throw new Error(
            `Cannot find primary contact linked with secondary contact ${JSON.stringify(
              singleContact
            )}: ${error}`
          );
        }

        const response: IdentifyRouteResBody = await buildResponseBody(
          primaryContact
        );

        return response;
      }
    }
    // The contact has new details, so create a secondary contact and link it to the primary contact
    const primaryContact = emailOrPhoneInDb[0];

    const secondaryContact: Prisma.ContactCreateInput = {
      phoneNumber: phoneNumber,
      email: email,
      linkPrecedence: "secondary",
      linkedId: primaryContact.id,
    };

    try {
      await prisma.contact.create({
        data: secondaryContact,
      });
    } catch (error) {
      throw new Error(`Error encountered while creating contact: ${error}`);
    }

    const response: IdentifyRouteResBody = await buildResponseBody(
      primaryContact
    );

    return response;
  } else if (emailOrPhoneInDb.length === 0) {
    // Create a new primary contact
    const primaryContact: Prisma.ContactCreateInput = {
      phoneNumber: phoneNumber,
      email: email,
      linkPrecedence: "primary",
    };

    let contactCreationResponse = null;
    try {
      contactCreationResponse = await prisma.contact.create({
        data: primaryContact,
      });
    } catch (error) {
      throw new Error(`Error encountered while creating contact: ${error}`);
    }

    const response = buildSingleContactResponseBody(contactCreationResponse);

    return response;
  } else {
    // Return contact details
    console.log("inside else");
    const primaryContact = emailOrPhoneInDb[0];

    const response: IdentifyRouteResBody = await buildResponseBody(
      primaryContact
    );

    return response;
  }
};

export { identify };
