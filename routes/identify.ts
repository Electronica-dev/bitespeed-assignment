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
    console.error("JSON is not valid. Please recheck.")
    throw new Error("JSON is not valid. Please recheck.");
  }

  const email = reqBody.email ?? null;
  const phoneNumber = reqBody.phoneNumber ?? null;

  let singleContact: Contact | null = null;
  let emailOrPhoneInDb: Contact[] = [];

  let primaryEmailContact: Contact | null = null;
  let primaryPhoneNumberContact: Contact | null = null;

  if (email && phoneNumber) {
    singleContact = await prisma.contact.findFirst({
      where: {
        email,
        phoneNumber,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!singleContact) {
      primaryEmailContact = await prisma.contact.findFirst({
        where: {
          email,
          linkPrecedence: "primary",
        },
      });

      primaryPhoneNumberContact = await prisma.contact.findFirst({
        where: {
          phoneNumber,
          linkPrecedence: "primary",
        },
      });

      // Special case where email and contact belong to different primary contacts
      if (primaryEmailContact && primaryPhoneNumberContact) {
        let primaryContacts: Contact[] = [
          primaryEmailContact,
          primaryPhoneNumberContact,
        ];

        primaryContacts.sort(
          (contact1, contact2) =>
            contact1.createdAt.getTime() - contact2.createdAt.getTime()
        );

        const oldestPrimaryContact: Contact = primaryContacts[0];

        const newPrimaryContact: Contact = primaryContacts[1];

        // Demote newer primary contact to secondary
        await prisma.contact.update({
          where: {
            id: newPrimaryContact.id,
          },
          data: {
            linkPrecedence: "secondary",
          },
        });

        // Relink primary contacts of the new secondary contact to the oldest primary contact
        await prisma.contact.updateMany({
          where: {
            linkedId: newPrimaryContact.id,
          },
          data: {
            linkedId: oldestPrimaryContact.id,
          },
        });

        const response: IdentifyRouteResBody = await buildResponseBody(
          oldestPrimaryContact
        );

        return response;
      }
    }
  }

  try {
    emailOrPhoneInDb = await prisma.contact.findMany({
      where: {
        OR: [
          { email: { not: null, equals: email } },
          { phoneNumber: { not: null, equals: phoneNumber } },
        ],
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  } catch (error) {
    console.error(`Unable to find contact with email ${email}: ${error}`);
    throw new Error(`Unable to find contact with email ${email}: ${error}`);
  }

  if (emailOrPhoneInDb.length !== 0 && email && phoneNumber) {
    if (singleContact) {
      // There is already a Contact in the DB with the following details so there is no need to
      // create a secondary contact
      if (singleContact.linkPrecedence === "primary") {
        const response: IdentifyRouteResBody = await buildResponseBody(
          singleContact
        );
        return response;
      } else {
        let primaryContact: Contact;

        if (!singleContact.linkedId) {
          console.error("Secondary contact linked id is empty");
          throw new Error("Secondary contact linked id is empty");
        }

        try {
          primaryContact = await prisma.contact.findUniqueOrThrow({
            where: {
              id: singleContact.linkedId,
            },
          });
        } catch (error) {
          console.error(
            `Cannot find primary contact linked with secondary contact ${JSON.stringify(
              singleContact
            )}: ${error}`
          );
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
      console.error(`Error encountered while creating contact: ${error}`);
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
      console.error(`Error encountered while creating contact: ${error}`);
      throw new Error(`Error encountered while creating contact: ${error}`);
    }

    const response = buildSingleContactResponseBody(contactCreationResponse);

    return response;
  } else {
    // Return contact details
    const primaryContact = emailOrPhoneInDb[0];

    const response: IdentifyRouteResBody = await buildResponseBody(
      primaryContact
    );

    return response;
  }
};

export { identify };
