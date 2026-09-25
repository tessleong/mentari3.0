import { useLingui } from "@lingui/react/macro";
import { Translate } from "@phosphor-icons/react";

import { IconHeaderView } from "./header-shared";

export function HeaderViewPlainEnglish({
  isActive,
  onClick = () => {},
}: {
  isActive: boolean;
  onClick?: () => void;
}) {
  const { t } = useLingui();

  return (
    <IconHeaderView
      isActive={isActive}
      label={t`Plain English`}
      icon={<Translate className="size-4" />}
      onClick={onClick}
      title={undefined}
      className="text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
    />
  );
}
