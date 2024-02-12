import { PrismaClient, Prisma, Contact } from "@prisma/client";
import Ajv from "ajv";
import { jsonSchema } from "./constants";

interface IdentifyRouteResBody {
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

const identifyRoute = async (reqBody: JSON) => {
  const valid = validate(reqBody);

  if (!valid) {
    throw new Error("JSON is not valid. Please recheck.");
  }

  const email = reqBody.email ?? null;
  const phoneNumber = reqBody.phoneNumber ?? null;
  let emailOrPhoneInDb = [];

  if (email) {
    emailOrPhoneInDb = await prisma.contact.findMany({
      where: {
        email,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  } else {
    emailOrPhoneInDb = await prisma.contact.findMany({
      where: {
        phoneNumber,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  if (emailOrPhoneInDb.length !== 0 && email && phoneNumber) {
    const primaryContact = emailOrPhoneInDb[0];

    // The contact has new details and has to be linked with it's primary contact
    const secondaryContact: Prisma.ContactCreateInput = {
      phoneNumber: phoneNumber,
      email: email,
      linkPrecedence: "secondary",
      linkedId: primaryContact.id,
    };

    let contactCreationResponse = null;
    try {
      contactCreationResponse = await prisma.contact.create({
        data: secondaryContact,
      });
    } catch (error) {
      throw new Error(`Error encountered while creating contact: ${error}`);
    }

    let secondaryContacts: Contact[] = [];
    try {
      secondaryContacts = await prisma.contact.findMany({
        where: {
          linkedId: primaryContact.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      throw new Error(
        `Error while querying DB for secondary contacts: ${error}`
      );
    }

    let secondaryContactEmails: string[] = [];
    let secondaryContactPhoneNumbers: string[] = [];

    const secondaryContactIds = secondaryContacts.map((contact) => contact.id);

    secondaryContacts.forEach((contact) => {
      if (!contact.email) {
        secondaryContactEmails.push("");
      } else if (contact.email !== primaryContact.email) {
        secondaryContactEmails.push(contact.email);
      }
    });

    secondaryContacts.forEach((contact) => {
      if (!contact.phoneNumber) {
        secondaryContactPhoneNumbers.push("");
      } else if (contact.phoneNumber !== primaryContact.phoneNumber) {
        secondaryContactPhoneNumbers.push(contact.phoneNumber);
      }
    });

    primaryContact.email
      ? secondaryContactEmails.splice(0, 0, primaryContact.email)
      : secondaryContactEmails.splice(0, 0, "");

    primaryContact.phoneNumber
      ? secondaryContactPhoneNumbers.splice(0, 0, primaryContact.phoneNumber)
      : secondaryContactPhoneNumbers.splice(0, 0, "");

    const response: IdentifyRouteResBody = {
      contact: {
        primaryContactId: primaryContact.id,
        emails: secondaryContactEmails,
        phoneNumbers: secondaryContactPhoneNumbers,
        secondaryContactIds,
      },
    };

    return response;
  } else if (emailOrPhoneInDb.length === 0) {
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

    const response: IdentifyRouteResBody = {
      contact: {
        primaryContactId: contactCreationResponse.id,
        emails: contactCreationResponse.email
          ? [contactCreationResponse.email]
          : [],
        phoneNumbers: contactCreationResponse.phoneNumber
          ? [contactCreationResponse.phoneNumber]
          : [],
        secondaryContactIds: [],
      },
    };

    return response;
  } else {
    const primaryContact = emailOrPhoneInDb[0];

    let secondaryContacts: Contact[] = [];
    try {
      secondaryContacts = await prisma.contact.findMany({
        where: {
          linkedId: primaryContact.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      throw new Error(
        `Error while querying DB for secondary contacts: ${error}`
      );
    }

    let response: IdentifyRouteResBody | null = null;

    if (secondaryContacts) {
      let secondaryContactEmails: string[] = [];
      let secondaryContactPhoneNumbers: string[] = [];

      const secondaryContactIds = secondaryContacts.map(
        (contact) => contact.id
      );

      secondaryContacts.forEach((contact) => {
        if (contact.email && contact.email !== primaryContact.email) {
          secondaryContactEmails.push(contact.email);
        }
      });

      secondaryContacts.forEach((contact) => {
        if (
          contact.phoneNumber &&
          contact.phoneNumber !== primaryContact.phoneNumber
        ) {
          secondaryContactPhoneNumbers.push(contact.phoneNumber);
        }
      });

      response = {
        contact: {
          primaryContactId: primaryContact.id,
          emails: primaryContact.email
            ? secondaryContactEmails.splice(0, 0, primaryContact.email)
            : secondaryContactEmails,
          phoneNumbers: primaryContact.phoneNumber
            ? secondaryContactPhoneNumbers.splice(
                0,
                0,
                primaryContact.phoneNumber
              )
            : secondaryContactPhoneNumbers,
          secondaryContactIds,
        },
      };
    } else {
      response = {
        contact: {
          primaryContactId: primaryContact.id,
          emails: primaryContact.email ? [primaryContact.email] : [],
          phoneNumbers: primaryContact.phoneNumber
            ? [primaryContact.phoneNumber]
            : [],
          secondaryContactIds: [],
        },
      };
    }

    return response;
  }
};

export { identifyRoute };
