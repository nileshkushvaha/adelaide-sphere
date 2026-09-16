import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Radio, Select, Space, Switch, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { PAGE_SECTION_LIMITS, type PageSection } from '@adelaide-sphere/domain/page-sections';
import type { StaticPageReferences } from '@/api/settings';
import { businessesApi } from '@/api/businesses';
import { MediaField } from '@/components/MediaField';
import { MenuIconPicker } from '@/components/MenuIconPicker';
import { RichTextEditorLazy } from '@/components/RichTextEditorLazy';
import { ButtonField } from './ButtonField';
import { emptyCard, errorsUnder, firstError, type FieldErrors } from './page-sections-model';

export interface ReferenceUpdate {
  document?: { id: string; title: string; url: string };
  business?: { id: string; name: string; slug: string; status: string };
}

interface Props {
  section: PageSection;
  index: number;
  onChange: (section: PageSection) => void;
  /** Errors for this section, with the `sections[i].` prefix removed. */
  errors: FieldErrors;
  references: StaticPageReferences;
  onReference: (update: ReferenceUpdate) => void;
  pageTitle: string;
  disabled: boolean;
}

/** `validateStatus` and `help` for a field path, so every input shows the API's message in place. */
const status = (errors: FieldErrors, path: string) => (firstError(errors, path) ? { validateStatus: 'error' as const, help: firstError(errors, path) } : {});

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * The fields for one section, laid out for someone who is not technical: plain
 * labels, an example in every empty field, character counts where there is a
 * limit, and each error beside the field it is about.
 */
export function SectionFields({ section, index, onChange, errors, references, onReference, pageTitle, disabled }: Props) {
  const id = (field: string) => `page-section-${index}-${field}`;
  const documents = references.documents;
  const onDocumentChosen = (documentId: string, document: { title: string; url: string }) => onReference({ document: { id: documentId, ...document } });

  switch (section.type) {
    case 'header':
      return (
        <>
          <Form.Item label="Small label above the heading" htmlFor={id('eyebrow')} extra="Optional, e.g. a category such as “Services”." {...status(errors, 'eyebrow')}>
            <Input id={id('eyebrow')} value={section.eyebrow ?? ''} maxLength={PAGE_SECTION_LIMITS.eyebrow} placeholder="e.g. Services" disabled={disabled} onChange={(event) => onChange({ ...section, eyebrow: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Heading" htmlFor={id('heading')} extra="Leave empty to use the page title." {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder={pageTitle || 'The page title'} disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Introduction" htmlFor={id('intro')} extra="One or two sentences saying what the page is about." {...status(errors, 'intro')}>
            <Input.TextArea id={id('intro')} rows={3} value={section.intro ?? ''} maxLength={PAGE_SECTION_LIMITS.intro} showCount placeholder="e.g. We help Adelaide businesses reach local customers." disabled={disabled} onChange={(event) => onChange({ ...section, intro: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Picture" extra="Optional. Shown beside the heading on wide screens." {...status(errors, 'imageId')}>
            <MediaField value={section.imageId} current={section.imageId ? (references.images[section.imageId] ?? null) : null} onChange={(imageId) => onChange({ ...section, imageId })} emptyLabel="No picture" disabled={disabled} aspectRatio="4 / 3" />
          </Form.Item>
          <ButtonField label="Button" value={section.button} onChange={(button) => onChange({ ...section, button })} errors={errorsUnder(errors, 'button.')} documents={documents} onDocumentChosen={onDocumentChosen} disabled={disabled} idPrefix={id('button')} />
        </>
      );

    case 'text':
      return (
        <Form.Item label="Text" extra="Headings, lists, links, tables and pictures. Scripts and styles are removed when you save." style={{ marginBottom: 0 }} {...status(errors, 'html')}>
          <div className="as-page-section__editor">
            <RichTextEditorLazy value={section.html} onChange={(html) => onChange({ ...section, html })} disabled={disabled} ariaLabel={`Text for section ${index + 1}`} minHeight={260} />
          </div>
        </Form.Item>
      );

    case 'imageText':
      return (
        <>
          <Form.Item label="Picture" {...status(errors, 'imageId')}>
            <MediaField value={section.imageId} current={section.imageId ? (references.images[section.imageId] ?? null) : null} onChange={(imageId) => onChange({ ...section, imageId })} emptyLabel="No picture yet" disabled={disabled} aspectRatio="4 / 3" />
          </Form.Item>
          <Form.Item label="Picture position">
            <Radio.Group value={section.imageSide} onChange={(event) => onChange({ ...section, imageSide: event.target.value as 'left' | 'right' })} disabled={disabled} optionType="button">
              <Radio value="left">Picture on the left</Radio>
              <Radio value="right">Picture on the right</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="Heading" htmlFor={id('heading')} {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="e.g. Local knowledge you can trust" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Text" {...status(errors, 'html')}>
            <div className="as-page-section__editor">
              <RichTextEditorLazy value={section.html} onChange={(html) => onChange({ ...section, html })} disabled={disabled} ariaLabel={`Text for section ${index + 1}`} minHeight={180} />
            </div>
          </Form.Item>
          <ButtonField label="Button" value={section.button} onChange={(button) => onChange({ ...section, button })} errors={errorsUnder(errors, 'button.')} documents={documents} onDocumentChosen={onDocumentChosen} disabled={disabled} idPrefix={id('button')} />
        </>
      );

    case 'callout':
      return (
        <>
          <Form.Item label="Heading" htmlFor={id('heading')} required {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="e.g. Ready to list your business?" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value })} />
          </Form.Item>
          <Form.Item label="Text" htmlFor={id('text')} extra="Optional. One sentence is enough." {...status(errors, 'text')}>
            <Input.TextArea id={id('text')} rows={2} value={section.text ?? ''} maxLength={PAGE_SECTION_LIMITS.calloutText} showCount placeholder="e.g. It takes five minutes and our editors check every listing." disabled={disabled} onChange={(event) => onChange({ ...section, text: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Style">
            <Radio.Group value={section.tone} onChange={(event) => onChange({ ...section, tone: event.target.value as 'light' | 'brand' })} disabled={disabled} optionType="button">
              <Radio value="brand">Dark band</Radio>
              <Radio value="light">Light panel</Radio>
            </Radio.Group>
          </Form.Item>
          <ButtonField label="Main button" required value={section.primary} onChange={(primary) => onChange({ ...section, primary: primary ?? section.primary })} errors={errorsUnder(errors, 'primary.')} documents={documents} onDocumentChosen={onDocumentChosen} disabled={disabled} idPrefix={id('primary')} />
          <ButtonField label="Second button" value={section.secondary} onChange={(secondary) => onChange({ ...section, secondary })} errors={errorsUnder(errors, 'secondary.')} documents={documents} onDocumentChosen={onDocumentChosen} disabled={disabled} idPrefix={id('secondary')} />
        </>
      );

    case 'cards': {
      const setCard = (cardIndex: number, patch: Partial<(typeof section.cards)[number]>) => onChange({ ...section, cards: section.cards.map((card, i) => (i === cardIndex ? { ...card, ...patch } : card)) });
      return (
        <>
          <Form.Item label="Heading" htmlFor={id('heading')} extra="Optional." {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="e.g. What we offer" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          {firstError(errors, 'cards') && <Alert type="error" showIcon message={firstError(errors, 'cards')} style={{ marginBottom: 12 }} />}
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {section.cards.map((card, cardIndex) => {
              const cardErrors = errorsUnder(errors, `cards[${cardIndex}].`);
              const cardId = (field: string) => id(`card-${cardIndex}-${field}`);
              return (
                <Card
                  key={cardIndex}
                  size="small"
                  title={`Card ${cardIndex + 1}`}
                  extra={
                    <Space size={2}>
                      <Button type="text" size="small" icon={<ArrowUpOutlined aria-hidden="true" />} aria-label={`Move card ${cardIndex + 1} up`} disabled={disabled || cardIndex === 0} onClick={() => onChange({ ...section, cards: move(section.cards, cardIndex, cardIndex - 1) })} />
                      <Button type="text" size="small" icon={<ArrowDownOutlined aria-hidden="true" />} aria-label={`Move card ${cardIndex + 1} down`} disabled={disabled || cardIndex === section.cards.length - 1} onClick={() => onChange({ ...section, cards: move(section.cards, cardIndex, cardIndex + 1) })} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove card ${cardIndex + 1}`} disabled={disabled} onClick={() => onChange({ ...section, cards: section.cards.filter((_, i) => i !== cardIndex) })} />
                    </Space>
                  }
                >
                  <div className="as-form-pair">
                    <Form.Item label="Icon" htmlFor={cardId('icon')} extra="Optional.">
                      <MenuIconPicker id={cardId('icon')} value={card.icon} onChange={(icon) => setCard(cardIndex, { icon: icon as typeof card.icon })} disabled={disabled} />
                    </Form.Item>
                    <Form.Item label="Title" htmlFor={cardId('title')} required {...status(cardErrors, 'title')}>
                      <Input id={cardId('title')} value={card.title} maxLength={PAGE_SECTION_LIMITS.cardTitle} placeholder="e.g. Verified listings" disabled={disabled} onChange={(event) => setCard(cardIndex, { title: event.target.value })} />
                    </Form.Item>
                  </div>
                  <Form.Item label="Text" htmlFor={cardId('text')} {...status(cardErrors, 'text')}>
                    <Input.TextArea id={cardId('text')} rows={2} value={card.text ?? ''} maxLength={PAGE_SECTION_LIMITS.cardText} showCount placeholder="e.g. Every business is checked by an editor before it appears." disabled={disabled} onChange={(event) => setCard(cardIndex, { text: event.target.value || null })} />
                  </Form.Item>
                  <Form.Item label="Links to" htmlFor={cardId('href')} extra="Optional. A page on this site such as /pricing, or a full https:// address." style={{ marginBottom: 0 }} {...status(cardErrors, 'href')}>
                    <Input id={cardId('href')} value={card.href ?? ''} placeholder="/pricing" disabled={disabled} onChange={(event) => setCard(cardIndex, { href: event.target.value || null })} />
                  </Form.Item>
                </Card>
              );
            })}
          </Space>
          <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => onChange({ ...section, cards: [...section.cards, emptyCard()] })} disabled={disabled || section.cards.length >= PAGE_SECTION_LIMITS.cardsMax} style={{ marginTop: 12 }}>
            Add a card
          </Button>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>
            Between {PAGE_SECTION_LIMITS.cardsMin} and {PAGE_SECTION_LIMITS.cardsMax} cards. Three or six look best.
          </Typography.Text>
        </>
      );
    }

    case 'faq':
      return (
        <>
          <Form.Item label="Heading" htmlFor={id('heading')} extra="Leave empty to use “Frequently asked questions”." {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="Frequently asked questions" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          {firstError(errors, 'items') && <Alert type="error" showIcon message={firstError(errors, 'items')} style={{ marginBottom: 12 }} />}
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {section.items.map((item, itemIndex) => {
              const itemErrors = errorsUnder(errors, `items[${itemIndex}].`);
              const setItem = (patch: Partial<typeof item>) => onChange({ ...section, items: section.items.map((entry, i) => (i === itemIndex ? { ...entry, ...patch } : entry)) });
              return (
                <Card
                  key={itemIndex}
                  size="small"
                  title={`Question ${itemIndex + 1}`}
                  extra={
                    <Space size={2}>
                      <Button type="text" size="small" icon={<ArrowUpOutlined aria-hidden="true" />} aria-label={`Move question ${itemIndex + 1} up`} disabled={disabled || itemIndex === 0} onClick={() => onChange({ ...section, items: move(section.items, itemIndex, itemIndex - 1) })} />
                      <Button type="text" size="small" icon={<ArrowDownOutlined aria-hidden="true" />} aria-label={`Move question ${itemIndex + 1} down`} disabled={disabled || itemIndex === section.items.length - 1} onClick={() => onChange({ ...section, items: move(section.items, itemIndex, itemIndex + 1) })} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove question ${itemIndex + 1}`} disabled={disabled} onClick={() => onChange({ ...section, items: section.items.filter((_, i) => i !== itemIndex) })} />
                    </Space>
                  }
                >
                  <Form.Item label="Question" htmlFor={id(`question-${itemIndex}`)} required {...status(itemErrors, 'question')}>
                    <Input id={id(`question-${itemIndex}`)} value={item.question} maxLength={PAGE_SECTION_LIMITS.question} placeholder="e.g. Is listing my business free?" disabled={disabled} onChange={(event) => setItem({ question: event.target.value })} />
                  </Form.Item>
                  <Form.Item label="Answer" style={{ marginBottom: 0 }} {...status(itemErrors, 'answerHtml')}>
                    <div className="as-page-section__editor">
                      <RichTextEditorLazy value={item.answerHtml} onChange={(answerHtml) => setItem({ answerHtml })} disabled={disabled} ariaLabel={`Answer to question ${itemIndex + 1}`} minHeight={120} />
                    </div>
                  </Form.Item>
                </Card>
              );
            })}
          </Space>
          <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => onChange({ ...section, items: [...section.items, { question: '', answerHtml: '' }] })} disabled={disabled || section.items.length >= PAGE_SECTION_LIMITS.faqMax} style={{ marginTop: 12 }}>
            Add a question
          </Button>
        </>
      );

    case 'businesses':
      return (
        <>
          <Form.Item label="Heading" htmlFor={id('heading')} extra="Optional." {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="e.g. Businesses we recommend" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Businesses" htmlFor={id('businesses')} required extra={`Published businesses only, up to ${PAGE_SECTION_LIMITS.businessesMax}. Search by name.`} style={{ marginBottom: 0 }} {...status(errors, 'businessIds')}>
            <BusinessPicker id={id('businesses')} value={section.businessIds} known={references.businesses} disabled={disabled} onChange={(businessIds) => onChange({ ...section, businessIds })} onReference={(business) => onReference({ business })} />
          </Form.Item>
        </>
      );

    case 'contact':
      return (
        <>
          <Form.Item label="Heading" htmlFor={id('heading')} extra="Leave empty to use “Get in touch”." {...status(errors, 'heading')}>
            <Input id={id('heading')} value={section.heading ?? ''} maxLength={PAGE_SECTION_LIMITS.heading} showCount placeholder="Get in touch" disabled={disabled} onChange={(event) => onChange({ ...section, heading: event.target.value || null })} />
          </Form.Item>
          <Form.Item label="Show the enquiry form" htmlFor={id('form')} extra="The email, phone and address come from Configuration → General settings." style={{ marginBottom: 0 }}>
            <Switch id={id('form')} checked={section.showForm} disabled={disabled} onChange={(showForm) => onChange({ ...section, showForm })} />
          </Form.Item>
        </>
      );
  }
}

/** Chooses published businesses by name; a business chosen earlier and since unpublished is flagged. */
function BusinessPicker({
  id,
  value,
  known,
  disabled,
  onChange,
  onReference,
}: {
  id: string;
  value: string[];
  known: StaticPageReferences['businesses'];
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onReference: (business: { id: string; name: string; slug: string; status: string }) => void;
}) {
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string; slug: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      businessesApi()
        .list({ status: 'published', q: term || undefined, pageSize: 20 }, controller.signal)
        .then((result) => {
          setOptions(result.data.map((business) => ({ id: business.id, name: business.name, slug: business.slug, status: business.status })));
          setFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const unpublished = value.filter((businessId) => known[businessId] && known[businessId]!.status !== 'published');
  const selectOptions = [
    ...value.filter((businessId) => !options.some((option) => option.id === businessId)).map((businessId) => ({ value: businessId, label: known[businessId]?.name ?? 'A chosen business' })),
    ...options.map((option) => ({ value: option.id, label: option.name })),
  ];

  return (
    <>
      <Select
        id={id}
        mode="multiple"
        showSearch
        filterOption={false}
        onSearch={setTerm}
        loading={loading}
        options={selectOptions}
        value={value}
        disabled={disabled}
        placeholder="Search for a business"
        notFoundContent={failed ? 'Businesses could not be loaded. Try again.' : loading ? 'Searching…' : 'No published business matches'}
        onChange={(ids: string[]) => {
          for (const businessId of ids) {
            const option = options.find((entry) => entry.id === businessId);
            if (option && !known[businessId]) onReference(option);
          }
          onChange(ids.slice(0, PAGE_SECTION_LIMITS.businessesMax));
        }}
        style={{ width: '100%' }}
      />
      {unpublished.length > 0 && (
        <Typography.Paragraph type="warning" style={{ margin: '8px 0 0' }}>
          {unpublished.map((businessId) => (
            <Tag key={businessId} color="orange">
              {known[businessId]!.name}
            </Tag>
          ))}
          {unpublished.length === 1 ? 'is' : 'are'} no longer published. Remove {unpublished.length === 1 ? 'it' : 'them'} before saving.
        </Typography.Paragraph>
      )}
    </>
  );
}
