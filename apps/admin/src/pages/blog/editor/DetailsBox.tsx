import { useState } from 'react';
import { App, Button, Form, Select, Switch, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { blogApi, type Author, type BlogTerm } from '@/api/blog';
import { FormSelect } from '@/components/FormSelect';
import { SectionCard } from '@/components/ui';
import { errorMessage } from '@/shared/useAsync';

interface Props {
  authors: Author[];
  categories: BlogTerm[];
  tags: BlogTerm[];
  onTagCreated: (tag: BlogTerm) => void;
  readOnly: boolean;
  /** The writer's default author; undefined while it is loading or could not be read. */
  defaultAuthorId?: string | null;
  onDefaultAuthorChanged: () => void;
}

const options = (items: { id: string; displayName?: string; name?: string; active: boolean }[]) =>
  items.filter((item) => item.active).map((item) => ({ value: item.id, label: item.displayName ?? item.name ?? item.id }));

/**
 * Who wrote it and where it belongs. A tag that does not exist yet can be added
 * from here while writing, rather than leaving the article for another screen.
 */
export function DetailsBox({ authors, categories, tags, onTagCreated, readOnly, defaultAuthorId, onDefaultAuthorChanged }: Props) {
  const form = Form.useFormInstance();
  const { message } = App.useApp();
  const chosenAuthorId = Form.useWatch('authorId', form) as string | undefined;
  const [savingDefault, setSavingDefault] = useState(false);
  const chosenAuthor = authors.find((author) => author.id === chosenAuthorId);

  const makeDefault = async () => {
    if (!chosenAuthorId) return;
    setSavingDefault(true);
    try {
      await blogApi().setMyAuthor(chosenAuthorId);
      message.success(`New articles will be credited to ${chosenAuthor?.displayName ?? 'this author'}`);
      onDefaultAuthorChanged();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSavingDefault(false);
    }
  };
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const typed = search.trim();
  const exists = tags.some((tag) => tag.name.toLowerCase() === typed.toLowerCase());

  const addTag = async () => {
    if (!typed || exists) return;
    setCreating(true);
    try {
      const tag = await blogApi().createTerm('blog-tags', { name: typed });
      onTagCreated(tag);
      const current = (form.getFieldValue('tagIds') as string[] | undefined) ?? [];
      form.setFieldValue('tagIds', [...current, tag.id]);
      // Setting a value programmatically is not an edit Ant reports; say so.
      form.setFields([{ name: 'tagIds', touched: true }]);
      setSearch('');
      message.success(`Tag “${tag.name}” added`);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SectionCard title="Details" style={{ marginBottom: 16 }}>
      <Form.Item label="Category" name="categoryId" rules={[{ required: true, message: 'Choose a category' }]}>
        <FormSelect showSearch optionFilterProp="label" placeholder="Choose a category" options={options(categories)} />
      </Form.Item>
      <Form.Item label="Tags" name="tagIds" extra="Up to 10. Type a new one to add it.">
        <Select
          mode="multiple"
          optionFilterProp="label"
          placeholder="Add any that apply"
          options={options(tags)}
          searchValue={search}
          onSearch={setSearch}
          onBlur={() => setSearch('')}
          maxCount={10}
          notFoundContent={
            typed && !readOnly ? (
              <Button type="link" icon={<PlusOutlined aria-hidden="true" />} loading={creating} onMouseDown={(event) => event.preventDefault()} onClick={() => void addTag()}>
                Add tag “{typed}”
              </Button>
            ) : (
              'No tags yet'
            )
          }
        />
      </Form.Item>
      <Form.Item label="Author" name="authorId" rules={[{ required: true, message: 'Choose an author' }]} style={{ marginBottom: 8 }}>
        <FormSelect showSearch optionFilterProp="label" placeholder="Choose an author" options={options(authors)} />
      </Form.Item>
      {/* The writer's own profile is remembered once and used for every new article. */}
      {defaultAuthorId !== undefined && chosenAuthor?.active && !readOnly && (
        chosenAuthorId === defaultAuthorId ? (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
            Your default author for new articles.
          </Typography.Text>
        ) : (
          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} loading={savingDefault} onClick={() => void makeDefault()}>
            {defaultAuthorId ? 'Use this author for my new articles instead' : 'Use this author for all my new articles'}
          </Button>
        )
      )}
      {authors.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          No author profiles yet. <Link to="/authors/new">Create one</Link>, then choose it here.
        </Typography.Text>
      )}
      {/* Paid articles are disclosed to readers and search engines (SRS 1.12). */}
      <Form.Item label="Paid guest post" name="guestPost" valuePropName="checked" extra="Shows a Guest post label; links in it are marked as sponsored." style={{ marginTop: 16, marginBottom: 0 }}>
        <Switch />
      </Form.Item>
    </SectionCard>
  );
}
