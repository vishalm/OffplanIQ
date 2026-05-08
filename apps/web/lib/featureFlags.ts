export const disable_ui_componets_due_to_lack_of_data =
  process.env.NEXT_PUBLIC_DISABLE_UI_COMPONENTS_DUE_TO_LACK_OF_DATA?.toLowerCase() === '1' ||
  process.env.NEXT_PUBLIC_DISABLE_UI_COMPONENTS_DUE_TO_LACK_OF_DATA?.toLowerCase() === 'true'

export const disableUiComponentsDueToLackOfData = disable_ui_componets_due_to_lack_of_data
