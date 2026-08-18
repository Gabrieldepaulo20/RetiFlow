/** Núcleo visual da O.S. — consumido pelo modal e pela página de detalhe. */

export { OSHeaderBar } from './OSHeaderBar';
export { OSStepper } from './OSStepper';
export { OSAltFinalBanner, OSLinkedNotesBanner } from './OSAlerts';
export { OSCard, OSCardTitle, OSDivider, OSField } from './OSCard';
export {
  OSClientCard,
  OSComplaintCard,
  OSObservationsCard,
  OSScheduleCard,
} from './OSSummaryCards';
export { OSAttachmentsCard, OSItemsTable } from './OSItemsTable';
export { OSTotalCard } from './OSTotalCard';
export { OSPaymentCard, type OSPaymentHandlers } from './OSPaymentCard';
export {
  OS_MAIN_FLOW,
  OS_STEP_HINT,
  buildOSDeadlineModel,
  buildOSItemRows,
  buildOSPaymentSummary,
  buildOSStepperModel,
  formatOSCurrency,
  formatOSDate,
  formatOSQuantity,
  formatOSRelativeTime,
  formatOSTime,
  osDaysInStage,
  type OSDeadlineModel,
  type OSItemRow,
  type OSPaymentSummary,
  type OSStep,
  type OSStepperModel,
} from './osViewModel';
export {
  OS_STATUS_ICON,
  OS_STATUS_PILL_ON_INK,
  OS_STATUS_PILL_ON_PANEL,
  osStatusIcon,
  osStatusTone,
  type OSStatusTone,
} from './osStatusVisuals';
