import { PendingSubmitButton } from '@/components/PendingSubmitButton';

type RuntimeSecretStatus = {
  available: boolean;
  preview?: string;
  stored: boolean;
};

type PlatformRuntimeSettingsFormProps = {
  action: (formData: FormData) => Promise<void>;
  canManageService: boolean;
  labels: {
    aiEmployeeWebhookSecret: string;
    clear: string;
    configuredFromEnvironment: string;
    maintenanceSecret: string;
    missing: string;
    productionOnlyHint: string;
    save: string;
    savedInPlatform: string;
    secretHint: string;
  };
  secrets: {
    aiEmployeeWebhookSecret: RuntimeSecretStatus;
    maintenanceSecret: RuntimeSecretStatus;
  };
};

type RuntimeSecretFieldLabels = Pick<
  PlatformRuntimeSettingsFormProps['labels'],
  'clear' | 'configuredFromEnvironment' | 'missing' | 'savedInPlatform' | 'secretHint'
>;

const RuntimeSecretField = (props: {
  canManageService: boolean;
  clearName: string;
  inputName: string;
  label: string;
  labels: RuntimeSecretFieldLabels;
  status: RuntimeSecretStatus;
}) => {
  const statusLabel = props.status.stored
    ? props.labels.savedInPlatform
    : props.status.available
      ? props.labels.configuredFromEnvironment
      : props.labels.missing;

  const statusClass = props.status.available
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700';

  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex flex-wrap items-center gap-2">
        {props.label}
        <span className={`
          rounded-full border px-2 py-0.5 text-[11px] font-semibold
          ${statusClass}
        `}
        >
          {statusLabel}
        </span>
      </span>
      <input
        name={props.inputName}
        type="password"
        autoComplete="off"
        placeholder={props.status.preview ?? '********'}
        disabled={!props.canManageService}
        className="
          dashboard-pill rounded-lg border px-3 py-2 text-sm
          disabled:cursor-not-allowed disabled:opacity-55
        "
      />
      <span className="text-xs text-muted-foreground">
        {props.labels.secretHint.replace('{preview}', props.status.preview ?? '********')}
      </span>
      <label className="
        flex items-center gap-2 text-xs font-normal text-muted-foreground
      "
      >
        <input
          name={props.clearName}
          type="checkbox"
          disabled={!props.canManageService || !props.status.stored}
        />
        {props.labels.clear}
      </label>
    </label>
  );
};

export const PlatformRuntimeSettingsForm = (
  props: PlatformRuntimeSettingsFormProps,
) => {
  return (
    <form
      action={props.action}
      className="
        mt-5 grid dashboard-surface gap-4 rounded-xl border p-4
        lg:grid-cols-2
      "
    >
      <div className="
        rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm
        text-amber-800
        lg:col-span-2
      "
      >
        {props.labels.productionOnlyHint}
      </div>

      <RuntimeSecretField
        canManageService={props.canManageService}
        clearName="clearAIEmployeeWebhookSecret"
        inputName="aiEmployeeWebhookSecret"
        label={props.labels.aiEmployeeWebhookSecret}
        labels={props.labels}
        status={props.secrets.aiEmployeeWebhookSecret}
      />

      <RuntimeSecretField
        canManageService={props.canManageService}
        clearName="clearMaintenanceSecret"
        inputName="maintenanceSecret"
        label={props.labels.maintenanceSecret}
        labels={props.labels}
        status={props.secrets.maintenanceSecret}
      />

      <div className="
        flex items-end
        lg:col-span-2
      "
      >
        <PendingSubmitButton
          disabled={!props.canManageService}
          className="
            w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold
            text-primary-foreground transition-opacity
            hover:opacity-90
            disabled:cursor-not-allowed disabled:opacity-55
            lg:w-auto
          "
        >
          {props.labels.save}
        </PendingSubmitButton>
      </div>
    </form>
  );
};
