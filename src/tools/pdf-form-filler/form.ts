import {
  adjustDimsForRotation,
  defaultTextFieldAppearanceProvider,
  layoutCombedText,
  layoutMultilineText,
  layoutSinglelineText,
  reduceRotation,
  PDFArray,
  PDFBool,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFString,
  PDFTextField,
  PDFAcroNonTerminal,
  StandardFonts,
} from 'pdf-lib'
import type { AppearanceProviderFor, PDFField, PDFFont, PDFObject } from 'pdf-lib'
import { embedSubsetFont, subsettingFontkit } from '../../lib/pdfFont'
import type { FillRequest, FormField, FormSummary, FormValue } from './types'

const key = PDFName.of
const textOf = (value: PDFObject | undefined): string =>
  value instanceof PDFString || value instanceof PDFHexString || value instanceof PDFName
    ? value.decodeText()
    : ''

type ChoiceField = PDFDropdown | PDFOptionList

function choiceOptions(field: ChoiceField) {
  return field.acroField.getOptions().map(({ value, display }) => ({
    value: value.decodeText(),
    label: (display ?? value).decodeText(),
  }))
}

function choiceSelection(field: ChoiceField): string[] {
  const options = choiceOptions(field)
  return field.acroField.getValues().map((value) => {
    const raw = value.decodeText()
    return options.find((option) => option.value === raw)?.label ?? raw
  })
}

/** Check before getForm(): pdf-lib otherwise silently deletes an XFA entry. */
function checkDocument(doc: PDFDocument): boolean {
  const acroForm = doc.catalog.lookup(key('AcroForm'))
  if (acroForm instanceof PDFDict && acroForm.has(key('XFA'))) {
    throw new Error(
      'XFA forms are not supported. Export a standard AcroForm PDF in the original application, then open that copy.',
    )
  }
  const seen = new Set<PDFObject>()
  let actions = false
  const visit = (object: PDFObject | undefined): void => {
    if (!object || seen.has(object)) return
    seen.add(object)
    if (object instanceof PDFRef) {
      visit(doc.context.lookup(object))
    } else if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index++) visit(object.get(index))
    } else if (object instanceof PDFDict) {
      const type = object.lookup(key('Type'))
      const fieldType = object.lookup(key('FT'))
      if (
        object.has(key('ByteRange')) ||
        (type === key('Sig') && object.has(key('Contents'))) ||
        (fieldType === key('Sig') && object.lookup(key('V')) instanceof PDFDict) ||
        object.has(key('DocMDP'))
      ) {
        throw new Error(
          'This PDF contains a digital signature. Saving would invalidate it. Obtain an unsigned copy before filling this form.',
        )
      }
      if (
        object.has(key('AA')) ||
        object.has(key('OpenAction')) ||
        object.lookup(key('S')) === key('JavaScript')
      )
        actions = true
      for (const [, value] of object.entries()) visit(value)
    }
  }
  visit(doc.catalog)
  for (const [, object] of doc.context.enumerateIndirectObjects()) visit(object)
  return actions
}

async function loadDocument(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (/encrypt/i.test(detail)) {
      throw new Error(
        'This PDF is encrypted or password-protected. Open an unencrypted copy; this tool does not unlock PDFs.',
        { cause: error },
      )
    }
    throw new Error(
      `This PDF is corrupt or could not be read. Export a fresh PDF and try again. ${detail}`,
      { cause: error },
    )
  }
}

function unsupported(field: FormField, reason: string): FormField {
  return { ...field, type: 'unsupported', reason }
}

function describeField(field: PDFField): FormField {
  const base: FormField = {
    name: field.getName(),
    label: textOf(field.acroField.dict.lookup(key('TU'))) || field.getName(),
    type: 'unsupported',
    value: '',
    readOnly: field.isReadOnly(),
    required: field.isRequired(),
  }
  if (field instanceof PDFSignature)
    return unsupported(
      base,
      'Unsigned signature fields are preserved, but signing is not supported.',
    )
  if (field instanceof PDFButton)
    return unsupported(
      base,
      'Push buttons and their actions are preserved, but are not run or edited.',
    )
  if (field instanceof PDFTextField) {
    base.value = textOf(field.acroField.V())
    if (field.isRichFormatted())
      return unsupported(
        base,
        'Rich-text formatting cannot be safely regenerated; this field is preserved unchanged.',
      )
    if (field.acroField.getFlags() & (1 << 20))
      return unsupported(base, 'File-selection text fields are preserved unchanged.')
    return {
      ...base,
      type: 'text',
      value: field.getText() ?? '',
      multiline: field.isMultiline(),
      password: field.isPassword(),
      maxLength: field.getMaxLength(),
    }
  }
  if (field instanceof PDFCheckBox) {
    if (!field.acroField.getOnValue())
      return unsupported(
        base,
        'The checkbox has no usable on-state appearance; repair it in the original application.',
      )
    const value = field.acroField.getValue()
    if (value !== key('Off') && value !== field.acroField.getOnValue())
      return unsupported(
        base,
        'The checkbox contains an unrecognized selection state and is preserved unchanged.',
      )
    return { ...base, type: 'checkbox', value: field.isChecked() }
  }
  if (field instanceof PDFRadioGroup) {
    const options = field.getOptions()
    const value = field.getSelected() ?? ''
    if (
      options.length === 0 ||
      new Set(options).size !== options.length ||
      options.includes('') ||
      (value !== '' && !options.includes(value))
    ) {
      return unsupported(
        { ...base, value },
        'The radio group has missing or ambiguous options and is preserved unchanged.',
      )
    }
    if (field.acroField.getWidgets().some((widget) => !widget.getOnValue())) {
      return unsupported(
        { ...base, value },
        'The radio group has an option without a usable appearance and is preserved unchanged.',
      )
    }
    return { ...base, type: 'radio', value, options }
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = choiceOptions(field)
    const labels = options.map((option) => option.label)
    const selected = choiceSelection(field)
    const editable = field instanceof PDFDropdown && field.isEditable()
    const multiselect = field.isMultiselect()
    const value = field instanceof PDFOptionList || multiselect ? selected : (selected[0] ?? '')
    if (
      new Set(labels).size !== labels.length ||
      new Set(options.map((option) => option.value)).size !== options.length ||
      labels.includes('')
    ) {
      return unsupported(
        { ...base, value },
        'The choice field has ambiguous or empty option labels and is preserved unchanged.',
      )
    }
    if (
      (!multiselect && selected.length > 1) ||
      (!editable && selected.some((item) => !labels.includes(item)))
    ) {
      return unsupported(
        { ...base, value },
        'The choice field contains values outside its options and is preserved unchanged.',
      )
    }
    return {
      ...base,
      type: field instanceof PDFDropdown ? 'dropdown' : 'list',
      value,
      options: labels,
      multiselect,
      editable,
    }
  }
  return unsupported(base, 'This field type is not supported and is preserved unchanged.')
}

function inspectDocument(doc: PDFDocument) {
  const hasActions = checkDocument(doc)
  const form = doc.getForm()
  const fields = form.getFields()
  const byRef = new Map(fields.map((field) => [field.ref.toString(), field]))
  const descriptions: FormField[] = []
  const warnings: string[] = []
  let canFlatten = true
  const names = new Set<string>()
  for (const [raw, ref] of form.acroForm.getAllFields()) {
    if (raw instanceof PDFAcroNonTerminal) continue
    const field = byRef.get(ref.toString())
    let description = field
      ? describeField(field)
      : {
          name: raw.getFullyQualifiedName() ?? `Unnamed field (${ref.toString()})`,
          label:
            textOf(raw.dict.lookup(key('TU'))) || raw.getFullyQualifiedName() || 'Unnamed field',
          type: 'unsupported' as const,
          value: textOf(raw.V()),
          readOnly: Boolean(raw.getFlags() & 1),
          required: Boolean(raw.getFlags() & 2),
          reason: 'Unrecognized field type; preserved unchanged in editable output.',
        }
    if (names.has(description.name)) {
      // A name-keyed UI cannot safely distinguish duplicate terminal fields.
      throw new Error(
        `This PDF has duplicate field names (${description.name}). Rename the fields in the original application before filling it.`,
      )
    }
    names.add(description.name)
    if (!description.name)
      description = unsupported(
        description,
        'An unnamed field cannot be edited safely and is preserved unchanged.',
      )
    descriptions.push(description)
    if (description.type === 'unsupported') {
      canFlatten = false
      warnings.push(`${description.label}: ${description.reason}`)
    }
    if (field) {
      const widgets = field.acroField.getWidgets()
      if (
        widgets.length === 0 ||
        widgets.some((widget) => (widget.getFlags() & (1 | 2 | 32)) !== 0)
      ) {
        canFlatten = false
        warnings.push(
          `${description.label}: hidden or non-visual widgets prevent safe flattening; editable export is still available.`,
        )
      }
    }
  }
  if (descriptions.length === 0) {
    canFlatten = false
    warnings.push(
      'No AcroForm fields were found. This may be a scanned, already flattened, or non-fillable PDF. Use a PDF with interactive form fields.',
    )
  }
  if (hasActions)
    warnings.push(
      'This PDF contains actions or calculations. They are not executed here; automatic calculations and scripted validation are not applied. Existing actions are preserved in editable output.',
    )
  if (!canFlatten && descriptions.length > 0)
    warnings.push(
      'Flattening is disabled to avoid losing unsupported or non-visual form content. Save an editable copy instead.',
    )
  return {
    form,
    fields,
    summary: {
      pageCount: doc.getPageCount(),
      fields: descriptions,
      warnings,
      canFlatten,
    } satisfies FormSummary,
  }
}

export async function inspectForm(bytes: Uint8Array): Promise<FormSummary> {
  const doc = await loadDocument(bytes)
  const summary = inspectDocument(doc).summary
  if (summary.fields.length === 0)
    throw new Error(
      'This PDF has no fillable AcroForm fields. It may be scanned, already flattened, or non-fillable. Open a PDF with interactive form fields.',
    )
  return summary
}

function invalid(field: FormField, detail: string): never {
  throw new Error(`${field.label}: ${detail}`)
}

function setChoice(field: ChoiceField, labels: string[]): void {
  const options = choiceOptions(field)
  const selection = labels.map((label) => ({
    label,
    index: options.findIndex((option) => option.label === label),
  }))
  const indexed = selection.every((item) => item.index >= 0)
  if (indexed) selection.sort((a, b) => a.index - b.index)
  const values = selection.map(({ label, index }) =>
    PDFHexString.fromText(options[index]?.value ?? label),
  )
  const dict = field.acroField.dict
  // pdf-lib's select() writes display labels into /V instead of export values,
  // and can silently enable editing/multiselect. Write only the value and /I.
  if (values.length === 0) dict.delete(key('V'))
  else dict.set(key('V'), values.length === 1 ? values[0] : dict.context.obj(values))
  if (selection.length > 0 && indexed) {
    dict.set(key('I'), dict.context.obj(selection.map((item) => item.index)))
  } else dict.delete(key('I'))
}

function applyValue(field: PDFField, description: FormField, value: FormValue): void {
  if (field instanceof PDFTextField) {
    if (typeof value !== 'string') invalid(description, 'Enter a text value.')
    if (description.maxLength !== undefined && value.length > description.maxLength)
      invalid(description, `Text exceeds the maximum length of ${description.maxLength}.`)
    if (!description.multiline && /[\r\n]/.test(value))
      invalid(description, 'This is a single-line field; line breaks are not allowed.')
    field.setText(value)
  } else if (field instanceof PDFCheckBox) {
    if (typeof value !== 'boolean') invalid(description, 'Use a checked or unchecked value.')
    if (value) field.check()
    else field.uncheck()
  } else if (field instanceof PDFRadioGroup) {
    if (typeof value !== 'string' || (value !== '' && !description.options?.includes(value)))
      invalid(description, 'Choose one of the available radio options.')
    if (value === '') field.clear()
    else field.select(value)
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const expectsArray = field instanceof PDFOptionList || description.multiselect
    if (expectsArray ? !Array.isArray(value) : !Array.isArray(value) && typeof value !== 'string')
      invalid(
        description,
        expectsArray ? 'Supply a list of selections.' : 'Choose a single option.',
      )
    const labels = Array.isArray(value) ? value : value === '' ? [] : [value as string]
    if (labels.some((label) => typeof label !== 'string'))
      invalid(description, 'Selections must be text values.')
    if (!description.multiselect && labels.length > 1)
      invalid(description, 'This field only allows one selection.')
    if (new Set(labels).size !== labels.length)
      invalid(description, 'Duplicate selections are not allowed.')
    if (!description.editable && labels.some((label) => !description.options?.includes(label)))
      invalid(description, 'Choose only from the available options.')
    setChoice(field, labels)
  }
}

function checkGlyphs(font: PDFFont, supported: Set<number>, text: string, name: string): void {
  for (const character of text) {
    if (character === '\n' || character === '\r' || character === '\t') continue
    const code = character.codePointAt(0)!
    if (!supported.has(code)) {
      throw new Error(
        `${name}: the supplied font does not support “${character}” (U+${code.toString(16).toUpperCase()}). Use supported characters or a PDF editor with a suitable font; no blank-glyph output was saved.`,
      )
    }
  }
  // Standard-font encoders also reject unsupported control sequences explicitly.
  font.encodeText(text.replace(/[\r\n\t]/g, ' '))
}

const fittedTextAppearance: AppearanceProviderFor<PDFTextField> = (field, widget, font) => {
  const appearance =
    widget.getDefaultAppearance() ?? field.acroField.getDefaultAppearance() ?? '0 g'
  const match = [...appearance.matchAll(/\/\S+\s+([-+]?\d*\.?\d+)\s+Tf/g)].at(-1)
  let size = Number(match?.[1]) || 12
  const rectangle = widget.getRectangle()
  const rotation = reduceRotation(widget.getAppearanceCharacteristics()?.getRotation())
  const { width, height } = adjustDimsForRotation(rectangle, rotation)
  const inset = (widget.getBorderStyle()?.getWidth() ?? 0) + (field.isCombed() ? 0 : 1)
  const bounds = { x: inset, y: inset, width: width - inset * 2, height: height - inset * 2 }
  const text = field.getText() ?? ''
  const fits = () => {
    const options = { alignment: field.getAlignment(), fontSize: size, font, bounds }
    const lines = field.isMultiline()
      ? layoutMultilineText(text, options).lines
      : field.isCombed()
        ? layoutCombedText(text, { ...options, cellCount: field.getMaxLength() ?? 0 }).cells
        : [layoutSinglelineText(text, options).line]
    return lines.every(
      (line) =>
        line.text.length === 0 ||
        (line.x >= bounds.x - 0.01 &&
          line.x + line.width <= bounds.x + bounds.width + 0.01 &&
          line.y >= bounds.y - 0.01 &&
          line.y + line.height <= bounds.y + bounds.height + 0.01),
    )
  }
  // Keep the PDF's declared size when it fits; changed text/font metrics can
  // otherwise put later multiline baselines outside the widget's clipping box.
  while (!fits()) {
    if (size <= 4 || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error(
        `${field.getName()}: the text does not fit visibly in this field. Shorten it before saving; no clipped output was saved.`,
      )
    }
    size = Math.max(4, size * 0.9)
  }
  widget.setDefaultAppearance(
    `${appearance.replace(/\/\S+\s+[-+]?\d*\.?\d+\s+Tf/g, '')}\n/${font.name} ${size} Tf`,
  )
  return defaultTextFieldAppearanceProvider(field, widget, font)
}

function updateAppearance(field: PDFField, font: PDFFont, supported: Set<number>): void {
  if (field instanceof PDFTextField) {
    const value = field.getText() ?? ''
    const displayed = field.isPassword() ? '*'.repeat(value.length) : value
    checkGlyphs(font, supported, displayed, field.getName())
    if (!field.isPassword()) field.updateAppearances(font, fittedTextAppearance)
    else {
      const original = field.acroField.dict.get(key('V'))
      field.acroField.dict.set(key('V'), PDFHexString.fromText(displayed))
      try {
        field.updateAppearances(font, fittedTextAppearance)
      } finally {
        if (original) field.acroField.dict.set(key('V'), original)
        else field.acroField.dict.delete(key('V'))
      }
    }
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const selected = choiceSelection(field)
    const rendered = field instanceof PDFOptionList ? field.getOptions() : selected
    for (const text of rendered) checkGlyphs(font, supported, text, field.getName())
    const dict = field.acroField.dict
    const original = dict.get(key('V'))
    const displayValues = selected.map((label) => PDFHexString.fromText(label))
    dict.set(
      key('V'),
      displayValues.length === 1 ? displayValues[0] : dict.context.obj(displayValues),
    )
    try {
      field.updateAppearances(font)
    } finally {
      if (original) dict.set(key('V'), original)
      else dict.delete(key('V'))
    }
  } else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
    field.updateAppearances()
    // Regenerated streams alone do not synchronize /AS for pre-existing values.
    field.acroField.setValue(field.acroField.getValue())
  }
}

export async function fillForm(bytes: Uint8Array, request: FillRequest): Promise<Uint8Array> {
  const doc = await loadDocument(bytes)
  const { form, fields, summary } = inspectDocument(doc)
  if (summary.fields.length === 0)
    throw new Error('This PDF has no interactive AcroForm fields to fill.')
  if (request.flatten && !summary.canFlatten)
    throw new Error(
      'This form cannot be safely flattened because it contains unsupported or non-visual fields. Save an editable copy instead.',
    )
  const descriptions = new Map(summary.fields.map((field) => [field.name, field]))
  const fieldsByName = new Map(fields.map((field) => [field.getName(), field]))
  for (const [name, value] of Object.entries(request.values)) {
    const description = descriptions.get(name)
    if (!description) throw new Error(`Unknown form field: ${name}`)
    if (description.readOnly || description.type === 'unsupported') continue
    const field = fieldsByName.get(name)
    if (field) applyValue(field, description, value)
  }
  const appearanceFields = fields.filter((field) => {
    const description = descriptions.get(field.getName())!
    return description.type !== 'unsupported' && (request.flatten || !description.readOnly)
  })
  let font: PDFFont
  if (request.fontBytes) {
    if (request.flatten) font = await embedSubsetFont(doc, request.fontBytes)
    else {
      // Editable output needs unused glyphs too; a subset breaks later edits.
      doc.registerFontkit(subsettingFontkit)
      font = await doc.embedFont(request.fontBytes, {
        subset: false,
        customName: `FormFont${doc.context.largestObjectNumber + 1}`,
      })
    }
  } else
    font = await doc.embedFont(StandardFonts.Helvetica, {
      customName: `FormFont${doc.context.largestObjectNumber + 1}`,
    })
  const supported = new Set(font.getCharacterSet())
  for (const field of appearanceFields) updateAppearance(field, font, supported)
  if (request.flatten) {
    const widgets = new Set(
      fields.flatMap((field) => field.acroField.getWidgets().map((widget) => widget.dict)),
    )
    // pdf-lib 1.17 removes appearance refs instead of widget refs from /Annots.
    // Capture the surviving annotations before flatten deletes widget objects.
    const remaining = doc.getPages().map((page) => ({
      page,
      annotations: page.node
        .Annots()
        ?.asArray()
        .filter((ref) => {
          const object = doc.context.lookup(ref)
          return !(object instanceof PDFDict && widgets.has(object))
        }),
    }))
    form.flatten({ updateFieldAppearances: false })
    for (const { page, annotations } of remaining) {
      if (annotations) page.node.set(key('Annots'), doc.context.obj(annotations))
    }
  } else {
    // /DA references must also resolve from AcroForm /DR for future edits, not
    // merely from each widget appearance stream's private resources.
    const dict = form.acroForm.dict
    const resources = dict.lookupMaybe(key('DR'), PDFDict) ?? doc.context.obj({})
    dict.set(key('DR'), resources)
    const fonts = resources.lookupMaybe(key('Font'), PDFDict) ?? doc.context.obj({})
    resources.set(key('Font'), fonts)
    const resourceName = fonts.uniqueKey('FormFont')
    fonts.set(resourceName, font.ref)
    // A full font can share its PostScript name with an existing subset. Use a
    // fresh /DR key so untouched read-only/unsupported fields keep their font.
    for (const field of appearanceFields) {
      if (!(
        field instanceof PDFTextField ||
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList
      ))
        continue
      for (const target of [
        field.acroField.dict,
        ...field.acroField.getWidgets().map((widget) => widget.dict),
      ]) {
        const appearance = target.lookup(key('DA'))
        if (appearance instanceof PDFString || appearance instanceof PDFHexString) {
          target.set(
            key('DA'),
            PDFString.of(
              appearance.decodeText().replaceAll(`/${font.name} `, `${resourceName.toString()} `),
            ),
          )
        }
      }
    }
    // Do not request viewer regeneration, which could overwrite our Unicode AP.
    dict.set(key('NeedAppearances'), PDFBool.False)
  }
  return doc.save({ updateFieldAppearances: false })
}
