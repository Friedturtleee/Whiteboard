import { ClerkResource } from "./resource.js";
import { ClerkResourceJSON } from "./json.js";

//#region src/types/enterpriseConnection.d.ts
interface EnterpriseConnectionJSON extends ClerkResourceJSON {
  object: 'enterprise_connection';
  name: string;
  active: boolean;
  provider: string;
  logo_public_url?: string | null;
  domains?: string[];
  organization_id?: string | null;
  sync_user_attributes: boolean;
  disable_additional_identifications: boolean;
  allow_organization_account_linking?: boolean;
  custom_attributes?: unknown[];
  oauth_config?: EnterpriseOAuthConfigJSON | null;
  saml_connection?: EnterpriseSamlConnectionNestedJSON | null;
  created_at: number;
  updated_at: number;
}
type EnterpriseConnectionJSONSnapshot = EnterpriseConnectionJSON;
interface EnterpriseConnectionResource extends ClerkResource {
  id: string;
  name: string;
  active: boolean;
  provider: string;
  logoPublicUrl: string | null;
  domains: string[];
  organizationId: string | null;
  syncUserAttributes: boolean;
  disableAdditionalIdentifications: boolean;
  allowOrganizationAccountLinking: boolean;
  customAttributes: unknown[];
  oauthConfig: EnterpriseOAuthConfigResource | null;
  samlConnection: EnterpriseSamlConnectionNestedResource | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  __internal_toSnapshot: () => EnterpriseConnectionJSONSnapshot;
}
interface EnterpriseSamlConnectionNestedJSON {
  id: string;
  name: string;
  active: boolean;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_certificate: string;
  idp_metadata_url: string;
  idp_metadata: string;
  acs_url: string;
  sp_entity_id: string;
  sp_metadata_url: string;
  allow_subdomains: boolean;
  allow_idp_initiated: boolean;
  force_authn: boolean;
}
interface EnterpriseSamlConnectionNestedResource {
  id: string;
  name: string;
  active: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  idpMetadataUrl: string;
  idpMetadata: string;
  acsUrl: string;
  spEntityId: string;
  spMetadataUrl: string;
  allowSubdomains: boolean;
  allowIdpInitiated: boolean;
  forceAuthn: boolean;
}
interface EnterpriseOAuthConfigJSON {
  id: string;
  name: string;
  provider_key?: string;
  client_id: string;
  discovery_url?: string;
  logo_public_url?: string | null;
  requires_pkce?: boolean;
  created_at: number;
  updated_at: number;
}
interface EnterpriseOAuthConfigResource {
  id: string;
  name: string;
  clientId: string;
  providerKey?: string;
  discoveryUrl?: string;
  logoPublicUrl?: string | null;
  requiresPkce?: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}
type OrganizationEnterpriseConnectionProvider = 'saml_custom' | 'saml_okta' | 'saml_google' | 'saml_microsoft' | 'oidc_custom' | 'oidc_github_enterprise' | 'oidc_gitlab';
/** @deprecated Use `OrganizationEnterpriseConnectionProvider` instead. */
type MeEnterpriseConnectionProvider = OrganizationEnterpriseConnectionProvider;
type OrganizationEnterpriseConnectionSamlInput = {
  idpEntityId?: string | null;
  idpSsoUrl?: string | null;
  idpCertificate?: string | null;
  idpMetadataUrl?: string | null;
  idpMetadata?: string | null;
  attributeMapping?: Record<string, unknown> | null;
  allowSubdomains?: boolean | null;
  allowIdpInitiated?: boolean | null;
  forceAuthn?: boolean | null;
};
/** @deprecated Use `OrganizationEnterpriseConnectionSamlInput` instead. */
type MeEnterpriseConnectionSamlInput = OrganizationEnterpriseConnectionSamlInput;
type OrganizationEnterpriseConnectionOidcInput = {
  clientId?: string | null;
  clientSecret?: string | null;
  discoveryUrl?: string | null;
  authUrl?: string | null;
  tokenUrl?: string | null;
  userInfoUrl?: string | null;
  requiresPkce?: boolean | null;
};
/** @deprecated Use `OrganizationEnterpriseConnectionOidcInput` instead. */
type MeEnterpriseConnectionOidcInput = OrganizationEnterpriseConnectionOidcInput;
type CreateOrganizationEnterpriseConnectionParams = {
  provider: OrganizationEnterpriseConnectionProvider;
  name?: string; /** FQDN strings the connection authenticates. Required by the org-scoped create endpoint. */
  domains?: string[];
  organizationId?: string | null;
  saml?: OrganizationEnterpriseConnectionSamlInput | null;
  oidc?: OrganizationEnterpriseConnectionOidcInput | null;
};
/** @deprecated Use `CreateOrganizationEnterpriseConnectionParams` instead. */
type CreateMeEnterpriseConnectionParams = CreateOrganizationEnterpriseConnectionParams;
type UpdateOrganizationEnterpriseConnectionParams = {
  name?: string | null;
  domains?: string[];
  active?: boolean | null;
  syncUserAttributes?: boolean | null;
  disableAdditionalIdentifications?: boolean | null;
  organizationId?: string | null;
  customAttributes?: Record<string, unknown> | null;
  saml?: OrganizationEnterpriseConnectionSamlInput | null;
  oidc?: OrganizationEnterpriseConnectionOidcInput | null;
};
/** @deprecated Use `UpdateOrganizationEnterpriseConnectionParams` instead. */
type UpdateMeEnterpriseConnectionParams = UpdateOrganizationEnterpriseConnectionParams;
//#endregion
export { CreateMeEnterpriseConnectionParams, CreateOrganizationEnterpriseConnectionParams, EnterpriseConnectionJSON, EnterpriseConnectionJSONSnapshot, EnterpriseConnectionResource, EnterpriseOAuthConfigJSON, EnterpriseOAuthConfigResource, EnterpriseSamlConnectionNestedJSON, EnterpriseSamlConnectionNestedResource, MeEnterpriseConnectionOidcInput, MeEnterpriseConnectionProvider, MeEnterpriseConnectionSamlInput, OrganizationEnterpriseConnectionOidcInput, OrganizationEnterpriseConnectionProvider, OrganizationEnterpriseConnectionSamlInput, UpdateMeEnterpriseConnectionParams, UpdateOrganizationEnterpriseConnectionParams };