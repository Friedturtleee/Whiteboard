import { SnakeToCamel } from "./utils.mjs";
import { AppleIdTokenStrategy, EmailCodeStrategy, EmailLinkStrategy, EnterpriseSSOStrategy, GoogleOneTapStrategy, OAuthStrategy, PhoneCodeStrategy, TicketStrategy, Web3Strategy } from "./strategies.mjs";
import { PhoneCodeChannel } from "./phoneCodeChannel.mjs";
import { VerificationResource } from "./verification.mjs";
import { EmailAddressIdentifier, EmailAddressOrPhoneNumberIdentifier, PhoneNumberIdentifier, UsernameIdentifier, Web3WalletIdentifier } from "./identifiers.mjs";
import { SignUpVerificationJSONSnapshot, SignUpVerificationsJSONSnapshot } from "./snapshots.mjs";
import { FirstNameAttribute, LastNameAttribute, LegalAcceptedAttribute, PasswordAttribute } from "./attributes.mjs";

//#region src/types/signUpCommon.d.ts
/** @inline */
type SignUpStatus = 'missing_requirements' | 'complete' | 'abandoned';
/** @inline */
type SignUpField = SignUpAttributeField | SignUpIdentificationField;
type PrepareVerificationParams = {
  strategy: EmailCodeStrategy;
} | {
  strategy: EmailLinkStrategy;
  redirectUrl?: string;
} | {
  strategy: PhoneCodeStrategy;
  channel?: PhoneCodeChannel;
} | {
  strategy: Web3Strategy;
} | {
  strategy: OAuthStrategy;
  redirectUrl?: string;
  actionCompleteRedirectUrl?: string;
  oidcPrompt?: string;
  oidcLoginHint?: string;
} | {
  strategy: EnterpriseSSOStrategy;
  redirectUrl?: string;
  actionCompleteRedirectUrl?: string;
};
type AttemptVerificationParams = {
  strategy: EmailCodeStrategy | PhoneCodeStrategy;
  code: string;
} | {
  strategy: Web3Strategy;
  signature: string;
};
/** @inline */
type SignUpAttributeField = FirstNameAttribute | LastNameAttribute | PasswordAttribute | LegalAcceptedAttribute;
/** @inline */
type SignUpVerifiableField = UsernameIdentifier | EmailAddressIdentifier | PhoneNumberIdentifier | EmailAddressOrPhoneNumberIdentifier | Web3WalletIdentifier;
/** @inline */
type SignUpIdentificationField = SignUpVerifiableField | OAuthStrategy | EnterpriseSSOStrategy;
type SignUpCreateParams = Partial<{
  externalAccountStrategy: string;
  externalAccountRedirectUrl: string;
  externalAccountActionCompleteRedirectUrl: string;
  strategy: OAuthStrategy | EnterpriseSSOStrategy | TicketStrategy | GoogleOneTapStrategy | AppleIdTokenStrategy | PhoneCodeStrategy;
  redirectUrl: string;
  actionCompleteRedirectUrl: string;
  transfer: boolean;
  unsafeMetadata: SignUpUnsafeMetadata;
  ticket: string;
  token: string;
  legalAccepted: boolean;
  oidcPrompt: string;
  oidcLoginHint: string;
  channel: PhoneCodeChannel;
  locale?: string;
} & Omit<SnakeToCamel<Record<SignUpAttributeField | SignUpVerifiableField, string>>, 'legalAccepted'>>;
type SignUpUpdateParams = SignUpCreateParams;
/**
 * @deprecated Use `SignUpAuthenticateWithWeb3Params` instead.
 */
type SignUpAuthenticateWithMetamaskParams = SignUpAuthenticateWithWeb3Params;
type SignUpAuthenticateWithWeb3Params = {
  unsafeMetadata?: SignUpUnsafeMetadata;
  legalAccepted?: boolean;
};
type SignUpAuthenticateWithSolanaParams = SignUpAuthenticateWithWeb3Params & {
  walletName: string;
};
interface SignUpVerificationsResource {
  emailAddress: SignUpVerificationResource;
  phoneNumber: SignUpVerificationResource;
  externalAccount: VerificationResource;
  web3Wallet: VerificationResource;
  __internal_toSnapshot: () => SignUpVerificationsJSONSnapshot;
}
interface SignUpVerificationResource extends VerificationResource {
  supportedStrategies: string[];
  nextAction: string;
  __internal_toSnapshot: () => SignUpVerificationJSONSnapshot;
}
//#endregion
export { AttemptVerificationParams, PrepareVerificationParams, SignUpAttributeField, SignUpAuthenticateWithMetamaskParams, SignUpAuthenticateWithSolanaParams, SignUpAuthenticateWithWeb3Params, SignUpCreateParams, SignUpField, SignUpIdentificationField, SignUpStatus, SignUpUpdateParams, SignUpVerifiableField, SignUpVerificationResource, SignUpVerificationsResource };