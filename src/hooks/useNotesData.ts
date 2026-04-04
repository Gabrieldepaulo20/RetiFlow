import { useData } from '@/contexts/DataContext';

/**
 * Provides only the notes-related slice of the data layer.
 * Prefer this over useData() in components that only interact with notes,
 * so their dependencies are explicit and swappable for an API later.
 */
export function useNotesData() {
  const {
    notes,
    addNote,
    updateNote,
    getNote,
    updateNoteStatus,
    createPurchaseNote,
    getChildNotes,
    services,
    getServicesForNote,
    replaceServicesForNote,
    addService,
    removeService,
    products,
    getProductsForNote,
    replaceProductsForNote,
    addProduct,
    removeProduct,
    attachments,
    getAttachmentsForNote,
    addAttachment,
  } = useData();

  return {
    notes,
    addNote,
    updateNote,
    getNote,
    updateNoteStatus,
    createPurchaseNote,
    getChildNotes,
    services,
    getServicesForNote,
    replaceServicesForNote,
    addService,
    removeService,
    products,
    getProductsForNote,
    replaceProductsForNote,
    addProduct,
    removeProduct,
    attachments,
    getAttachmentsForNote,
    addAttachment,
  };
}
