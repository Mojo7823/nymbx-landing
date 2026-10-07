import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib'

async function createDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const date = new Date('2026-01-01T00:00:00.000Z')
  doc.setCreationDate(date)
  doc.setModificationDate(date)
  doc.setTitle('PDF form filler regression fixture')
  doc.setAuthor('nymbx')
  doc.setCreator('nymbx fixtures')
  doc.setProducer('nymbx fixtures')
  return doc
}

/** A real, deterministic two-page AcroForm, usable in both Node and a browser. */
export async function createFormFixture(): Promise<Uint8Array> {
  const doc = await createDocument()
  const first = doc.addPage([612, 792])
  const second = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const form = doc.getForm()
  first.drawText('Contact details', { x: 40, y: 750, size: 18, font })
  second.drawText('Preferences', { x: 40, y: 750, size: 18, font })

  const fullName = form.createTextField('fullName')
  fullName.acroField.dict.set(PDFName.of('TU'), PDFString.of('Full name'))
  fullName.setMaxLength(24)
  fullName.enableRequired()
  fullName.setText('Alice Example')
  fullName.addToPage(first, { x: 40, y: 680, width: 300, height: 28, font })

  const notes = form.createTextField('notes')
  notes.enableMultiline()
  notes.setText('First line\nSecond line')
  notes.addToPage(first, { x: 40, y: 530, width: 400, height: 110, font })

  const accountId = form.createTextField('accountId')
  accountId.setText('ACCOUNT-007')
  accountId.enableReadOnly()
  accountId.addToPage(first, { x: 40, y: 460, width: 240, height: 28, font })

  const subscribed = form.createCheckBox('subscribed')
  subscribed.addToPage(first, { x: 40, y: 400, width: 20, height: 20 })
  subscribed.check()
  first.drawText('Receive updates', { x: 70, y: 405, size: 12, font })

  const contact = form.createRadioGroup('contact')
  contact.addOptionToPage('Email', second, { x: 40, y: 670, width: 20, height: 20 })
  contact.addOptionToPage('Phone', second, { x: 180, y: 670, width: 20, height: 20 })
  contact.select('Email')
  second.drawText('Email', { x: 70, y: 675, size: 12, font })
  second.drawText('Phone', { x: 210, y: 675, size: 12, font })

  const country = form.createDropdown('country')
  country.setOptions(['Taiwan', 'Japan', 'Canada'])
  country.select('Taiwan')
  country.addToPage(second, { x: 40, y: 590, width: 240, height: 28, font })

  const languages = form.createOptionList('languages')
  languages.setOptions(['English', 'Chinese', 'Japanese'])
  languages.enableMultiselect()
  languages.select(['English', 'Chinese'])
  languages.addToPage(second, { x: 40, y: 400, width: 240, height: 140, font })

  form.updateFieldAppearances(font)
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false })
}

export async function createNoFormFixture(): Promise<Uint8Array> {
  const doc = await createDocument()
  doc.addPage([612, 792]).drawText('This PDF has no interactive form fields.')
  return doc.save({ useObjectStreams: false })
}

/** Hybrid XFA/AcroForm: getForm() would silently discard its XFA packet. */
export async function createXfaFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await createFormFixture(), { updateMetadata: false })
  const form = doc.getForm()
  const xfa = doc.context.register(
    doc.context.flateStream(
      '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="dynamic"/></template></xdp:xdp>',
    ),
  )
  form.acroForm.dict.set(PDFName.of('XFA'), xfa)
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false })
}
