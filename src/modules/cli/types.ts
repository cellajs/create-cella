/** CLI options parsed from command line arguments */
export interface CLIOptions {
  template?: string;
  appIndex?: number;
  adminEmail?: string;
}

/** CLI configuration state */
export interface CLIConfig {
  options: CLIOptions;
  args: string[];
  directory: string | null;
  packageManager: string;
}

/** Options for creating a new project */
export interface CreateOptions {
  projectName: string;
  targetFolder: string;
  packageManager: string;
  templateUrl?: string;
  /** Git ref (release tag or branch) to check out the template at. Ignored for local templates. */
  templateRef?: string;
  /** This app's number on the machine, sets `devAppIndex` and the database ports (0 = default ports) */
  appIndex: number;
  /** Admin email for initial seed user (defaults to admin@{slug}.example.com) */
  adminEmail?: string;
  /** Suppress all output (for testing) */
  silent?: boolean;
}

/** Options for adding a remote to the repository */
export interface AddRemoteOptions {
  targetFolder: string;
  remoteUrl?: string;
  remoteName?: string;
  /** If true, don't throw on failure */
  silent?: boolean;
}
