import { Contact, PrismaClient } from "@prisma/client";
import { IdentifyRouteResBody } from "./routes/identify";

const prisma = new PrismaClient();

export const getSecondaryContactDetails = (
  primaryContact: Contact,
  secondaryContacts: Contact[],
  property: "email" | "phoneNumber"
): string[] => {
  let details: string[] = [];

  secondaryContacts.forEach((contact) => {
    if (contact[property] !== primaryContact[property]) {
      details.push(contact[property] ?? "");
    }
  });

  return details;
};

export const addPrimaryPropertyAtFirst = (
  primaryContact: Contact,
  secondaryContactPropertyList: string[],
  property: "email" | "phoneNumber"
): string[] => {
  const primaryContactProperty = primaryContact[property] ?? "";

  primaryContactProperty
    ? secondaryContactPropertyList.splice(0, 0, primaryContactProperty)
    : secondaryContactPropertyList.splice(0, 0, "");

  return secondaryContactPropertyList;
};

export const buildResponseBody = async (
  primaryContact: Contact
): Promise<IdentifyRouteResBody> => {
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
    console.error(`Error while querying DB for secondary contacts: ${error}`);
    throw new Error(`Error while querying DB for secondary contacts: ${error}`);
  }

  if (secondaryContacts.length !== 0) {
    const secondaryContactIds = secondaryContacts.map((contact) => contact.id);
    const secondaryContactEmails = getSecondaryContactDetails(
      primaryContact,
      secondaryContacts,
      "email"
    );
    const secondaryContactPhoneNumbers = getSecondaryContactDetails(
      primaryContact,
      secondaryContacts,
      "phoneNumber"
    );

    const response: IdentifyRouteResBody = {
      contact: {
        primaryContactId: primaryContact.id,
        emails: addPrimaryPropertyAtFirst(
          primaryContact,
          secondaryContactEmails,
          "email"
        ),
        phoneNumbers: addPrimaryPropertyAtFirst(
          primaryContact,
          secondaryContactPhoneNumbers,
          "phoneNumber"
        ),
        secondaryContactIds,
      },
    };

    return response;
  } else {
    const response: IdentifyRouteResBody =
      buildSingleContactResponseBody(primaryContact);
    return response;
  }
};

export const buildSingleContactResponseBody = (
  primaryContact: Contact
): IdentifyRouteResBody => {
  const response: IdentifyRouteResBody = {
    contact: {
      primaryContactId: primaryContact.id,
      emails: primaryContact.email ? [primaryContact.email] : [],
      phoneNumbers: primaryContact.phoneNumber
        ? [primaryContact.phoneNumber]
        : [],
      secondaryContactIds: [],
    },
  };

  return response;
};
