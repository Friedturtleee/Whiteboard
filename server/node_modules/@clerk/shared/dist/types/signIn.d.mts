import { ClerkResource } from "./resource.mjs";
import { ValidatePasswordCallbacks } from "./passwords.mjs";
import { AuthenticateWithPopupParams, AuthenticateWithRedirectParams } from "./redirects.mjs";
import { CreateEmailLinkFlowReturn, VerificationResource } from "./verification.mjs";
import { AttemptFirstFactorParams, AttemptSecondFactorParams, AuthenticateWithPasskeyParams, PrepareFirstFactorParams, PrepareSecondFactorParams, ResetPasswordParams, SignInAuthenticateWithSolanaParams, SignInCreateParams, SignInFirstFactor, SignInIdentifier, SignInSecondFactor, SignInStartEmailLinkFlowParams, SignInStatus, UserData } from "./signInCommon.mjs";
import { SignInFutureResource } from "./signInFuture.mjs";
import { AuthenticateWithWeb3Params } from "./web3Wallet.mjs";
import { SignInJSONSnapshot } from "./snapshots.mjs";
import { ClerkResourceJSON, ClientTrustState, SignInFirstFactorJSON, SignInSecondFactorJSON, UserDataJSON, VerificationJSON } from "./json.mjs";

//#region src/types/signIn.d.ts
/**
 * The `SignIn` object holds the state of the current sign-in and provides helper methods to navigate and complete the sign-in process. It is used to manage the sign-in lifecycle, including the first and second factor verification, and the creation of a new session.
 */
interface SignInResource extends ClerkResource {
  /**
   * The current status of the sign-in.
   */
  status: SignInStatus | null;
  /**
   * @deprecated This attribute will be removed in the next major version.
   */
  supportedIdentifiers: SignInIdentifier[];
  supportedFirstFactors: SignInFirstFactor[] | null;
  supportedSecondFactors: SignInSecondFactor[] | null;
  clientTrustState?: ClientTrustState;
  firstFactorVerification: VerificationResource;
  secondFactorVerification: VerificationResource;
  identifier: string | null;
  createdSessionId: string | null;
  userData: UserData;
  create: (params: SignInCreateParams) => Promise<SignInResource>;
  resetPassword: (params: ResetPasswordParams) => Promise<SignInResource>;
  prepareFirstFactor: (params: PrepareFirstFactorParams) => Promise<SignInResource>;
  attemptFirstFactor: (params: AttemptFirstFactorParams) => Promise<SignInResource>;
  prepareSecondFactor: (params: PrepareSecondFactorParams) => Promise<SignInResource>;
  attemptSecondFactor: (params: AttemptSecondFactorParams) => Promise<SignInResource>;
  authenticateWithRedirect: (params: AuthenticateWithRedirectParams) => Promise<void>;
  authenticateWithPopup: (params: AuthenticateWithPopupParams) => Promise<void>;
  authenticateWithWeb3: (params: AuthenticateWithWeb3Params) => Promise<SignInResource>;
  authenticateWithMetamask: () => Promise<SignInResource>;
  authenticateWithCoinbaseWallet: () => Promise<SignInResource>;
  authenticateWithOKXWallet: () => Promise<SignInResource>;
  authenticateWithBase: () => Promise<SignInResource>;
  authenticateWithSolana: (params: SignInAuthenticateWithSolanaParams) => Promise<SignInResource>;
  authenticateWithPasskey: (params?: AuthenticateWithPasskeyParams) => Promise<SignInResource>;
  createEmailLinkFlow: () => CreateEmailLinkFlowReturn<SignInStartEmailLinkFlowParams, SignInResource>;
  validatePassword: (password: string, callbacks?: ValidatePasswordCallbacks) => void;
  /**
   * @internal
   */
  __internal_toSnapshot: () => SignInJSONSnapshot;
  /**
   * @internal
   */
  __internal_future: SignInFutureResource;
}
interface SignInJSON extends ClerkResourceJSON {
  object: 'sign_in';
  id: string;
  status: SignInStatus;
  client_trust_state?: ClientTrustState;
  /**
   * @deprecated This attribute will be removed in the next major version.
   */
  supported_identifiers: SignInIdentifier[];
  identifier: string;
  user_data: UserDataJSON;
  supported_first_factors: SignInFirstFactorJSON[];
  supported_second_factors: SignInSecondFactorJSON[];
  first_factor_verification: VerificationJSON | null;
  second_factor_verification: VerificationJSON | null;
  created_session_id: string | null;
}
//#endregion
export { SignInJSON, SignInResource };