import { TransactionMeta } from '@metamask/transaction-controller';
import { ethErrors, serializeError } from 'eth-rpc-errors';
import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ConfirmAlertModal } from '../../../../../components/app/alert-system/confirm-alert-modal';
import {
  Button,
  ButtonSize,
  ButtonVariant,
  IconName,
} from '../../../../../components/component-library';
import { Footer as PageFooter } from '../../../../../components/multichain/pages/page';
import { useI18nContext } from '../../../../../hooks/useI18nContext';
import {
  doesAddressRequireLedgerHidConnection,
  getCustomNonceValue,
} from '../../../../../selectors';
///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
import { useMMIConfirmations } from '../../../../../hooks/useMMIConfirmations';
import { getNoteToTraderMessage } from '../../../../../selectors/institutional/selectors';
///: END:ONLY_INCLUDE_IF
import useAlerts from '../../../../../hooks/useAlerts';
import {
  rejectPendingApproval,
  resolvePendingApproval,
  ///: BEGIN:ONLY_INCLUDE_IF(build-main,build-beta,build-flask)
  updateAndApproveTx,
  ///: END:ONLY_INCLUDE_IF
} from '../../../../../store/actions';
import { selectUseTransactionSimulations } from '../../../selectors/preferences';

import {
  isPermitSignatureRequest,
  isSIWESignatureRequest,
  REDESIGN_DEV_TRANSACTION_TYPES,
} from '../../../utils';
import { useConfirmContext } from '../../../context/confirm';
import { getConfirmationSender } from '../utils';
import { MetaMetricsEventLocation } from '../../../../../../shared/constants/metametrics';
import { Severity } from '../../../../../helpers/constants/design-system';

export type OnCancelHandler = ({
  location,
}: {
  location: MetaMetricsEventLocation;
}) => void;

function getButtonDisabledState(
  hasUnconfirmedDangerAlerts: boolean,
  hasBlockingAlerts: boolean,
  disabled: boolean,
) {
  if (hasBlockingAlerts) {
    return true;
  }

  if (hasUnconfirmedDangerAlerts) {
    return false;
  }

  return disabled;
}

const ConfirmButton = ({
  alertOwnerId = '',
  disabled,
  onSubmit,
  onCancel,
}: {
  alertOwnerId?: string;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: OnCancelHandler;
}) => {
  const t = useI18nContext();

  const [confirmModalVisible, setConfirmModalVisible] =
    useState<boolean>(false);

  const { dangerAlerts, hasDangerAlerts, hasUnconfirmedDangerAlerts } =
    useAlerts(alertOwnerId);

  const hasDangerBlockingAlerts = dangerAlerts.some(
    (alert) => alert.severity === Severity.Danger && alert.isBlocking,
  );

  const handleCloseConfirmModal = useCallback(() => {
    setConfirmModalVisible(false);
  }, []);

  const handleOpenConfirmModal = useCallback(() => {
    setConfirmModalVisible(true);
  }, []);

  return (
    <>
      {confirmModalVisible && (
        <ConfirmAlertModal
          ownerId={alertOwnerId}
          onClose={handleCloseConfirmModal}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      )}
      {hasDangerAlerts ? (
        <Button
          block
          danger
          data-testid="confirm-footer-button"
          disabled={getButtonDisabledState(
            hasUnconfirmedDangerAlerts,
            hasDangerBlockingAlerts,
            disabled,
          )}
          onClick={handleOpenConfirmModal}
          size={ButtonSize.Lg}
          startIconName={IconName.Danger}
        >
          {dangerAlerts?.length > 0 ? t('reviewAlerts') : t('confirm')}
        </Button>
      ) : (
        <Button
          block
          data-testid="confirm-footer-button"
          disabled={disabled}
          onClick={onSubmit}
          size={ButtonSize.Lg}
        >
          {t('confirm')}
        </Button>
      )}
    </>
  );
};

const Footer = () => {
  const dispatch = useDispatch();
  const t = useI18nContext();
  const customNonceValue = useSelector(getCustomNonceValue);
  const useTransactionSimulations = useSelector(
    selectUseTransactionSimulations,
  );
  const { currentConfirmation, isScrollToBottomCompleted } =
    useConfirmContext();
  const { from } = getConfirmationSender(currentConfirmation);

  ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
  const noteToTraderMessage = useSelector(getNoteToTraderMessage);
  const { mmiOnTransactionCallback, mmiOnSignCallback, mmiSubmitDisabled } =
    useMMIConfirmations();
  ///: END:ONLY_INCLUDE_IF

  const hardwareWalletRequiresConnection = useSelector((state) => {
    if (from) {
      return doesAddressRequireLedgerHidConnection(state, from);
    }
    return false;
  });

  const isSIWE = isSIWESignatureRequest(currentConfirmation);
  const isPermit = isPermitSignatureRequest(currentConfirmation);
  const isPermitSimulationShown = isPermit && useTransactionSimulations;

  const isConfirmDisabled =
    (!isScrollToBottomCompleted && !isSIWE && !isPermitSimulationShown) ||
    ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
    mmiSubmitDisabled ||
    ///: END:ONLY_INCLUDE_IF
    hardwareWalletRequiresConnection;

  const onCancel = useCallback(
    ({ location }: { location?: MetaMetricsEventLocation }) => {
      if (!currentConfirmation) {
        return;
      }

      const error = ethErrors.provider.userRejectedRequest();
      error.data = { location };

      dispatch(
        rejectPendingApproval(currentConfirmation.id, serializeError(error)),
      );
    },
    [currentConfirmation],
  );

  const onSubmit = useCallback(() => {
    if (!currentConfirmation) {
      return;
    }

    const isTransactionConfirmation = REDESIGN_DEV_TRANSACTION_TYPES.find(
      (type) => type === currentConfirmation?.type,
    );
    if (isTransactionConfirmation) {
      const mergeTxDataWithNonce = (transactionData: TransactionMeta) =>
        customNonceValue
          ? {
              ...transactionData,
              customNonceValue,
            }
          : transactionData;

      const updatedTx = mergeTxDataWithNonce(
        currentConfirmation as TransactionMeta,
      );

      ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
      mmiOnTransactionCallback(updatedTx, noteToTraderMessage);
      ///: END:ONLY_INCLUDE_IF

      ///: BEGIN:ONLY_INCLUDE_IF(build-main,build-beta,build-flask)
      dispatch(updateAndApproveTx(updatedTx, true, ''));
      ///: END:ONLY_INCLUDE_IF
    } else {
      dispatch(resolvePendingApproval(currentConfirmation.id, undefined));

      ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
      mmiOnSignCallback();
      ///: END:ONLY_INCLUDE_IF
    }
  }, [
    currentConfirmation,
    customNonceValue,
    ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
    noteToTraderMessage,
    ///: END:ONLY_INCLUDE_IF
  ]);

  const onFooterCancel = useCallback(() => {
    onCancel({ location: MetaMetricsEventLocation.Confirmation });
  }, [currentConfirmation, onCancel]);

  return (
    <PageFooter className="confirm-footer_page-footer">
      <Button
        block
        data-testid="confirm-footer-cancel-button"
        onClick={onFooterCancel}
        size={ButtonSize.Lg}
        variant={ButtonVariant.Secondary}
      >
        {t('cancel')}
      </Button>
      <ConfirmButton
        alertOwnerId={currentConfirmation?.id}
        onSubmit={() => onSubmit()}
        disabled={isConfirmDisabled}
        onCancel={onCancel}
      />
    </PageFooter>
  );
};

export default Footer;
