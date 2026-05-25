import { Sandbox } from "@cloudflare/sandbox";
import { computerEgressHandler, type ComputerEgressEnv, type ComputerEgressParams } from "./computer-egress.ts";

/** Durable Computer runtime class loaded by the Cloudflare Worker bundle.
 *
 * It is isolated from the Node/Vitest-imported API module because the upstream
 * Containers runtime is bundler/Workers-oriented and is not directly Node ESM
 * executable. GitLab egress is registered fail-closed and enabled only for
 * configured GitLab hosts through the deliberately reviewed Containers patch. */
export class CloudboxSandbox extends Sandbox<ComputerEgressEnv> {
  // Added by the reviewed host-only HTTPS interception patch carried in
  // patches/@cloudflare__containers@0.3.4-host-https.patch.
  override interceptHttpsByHost = true;
  async configureGitLabTransport(params: ComputerEgressParams): Promise<void> {
    await this.setOutboundByHosts<ComputerEgressParams>({
      "gitlab.cfdata.org": { method: "gitlab", params },
      "gitlab-access.cfdata.org": { method: "gitlab", params },
    });
  }
}

CloudboxSandbox.outboundHandlers = { gitlab: computerEgressHandler as never };
