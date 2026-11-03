"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  Avatar,
  Badge,
  Banner,
  Button,
  Checkbox,
  Chips,
  Combobox,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  FileDrop,
  Icon,
  ICON_NAMES,
  IconButton,
  Input,
  Kbd,
  LinkButton,
  Menu,
  MenuItem,
  MenuLabel,
  MenuLinkItem,
  MenuSeparator,
  Meter,
  Pagination,
  PhoneInput,
  Popover,
  Radio,
  RadioCard,
  RadioGroup,
  Segmented,
  Select,
  ServiceTag,
  Sheet,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TabLinks,
  TabPanel,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
  type BadgeTone,
  type ButtonVariant,
} from "@/ui";

// Sample content for the preview only. None of it is shown to customers.
const CITIES = [
  { value: "pune", label: "Pune" },
  { value: "mumbai", label: "Mumbai" },
  { value: "nagpur", label: "Nagpur" },
  { value: "nashik", label: "Nashik" },
];
const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const TONES: readonly BadgeTone[] = ["neutral", "pos", "neg", "warn", "info", "accent"];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-panel border border-border bg-surface">
      <h2 className="flex min-h-panel-header items-center border-b border-border-subtle px-4 type-section">{title}</h2>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

function Row({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ToastDemo() {
  const toast = useToast();
  return <Button onClick={() => toast("Saved. Your website updates in about a minute.")}>Show a toast</Button>;
}

export function Showcase() {
  const [chip, setChip] = useState("all");
  const [view, setView] = useState("month");
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="type-title">Design system</h1>
        <p className="type-meta">Every primitive in src/ui, in each state. Development only.</p>
      </header>

      <Section title="Type">
        <p className="type-title">Page title, 22/28</p>
        <p className="type-section">Section title, 14/20</p>
        <p className="type-sub">Row title, 14/20</p>
        <p className="type-body">Body text, 14/20</p>
        <p className="type-table">Table cell, 13.5/20</p>
        <p className="type-meta">Meta line, 13/18</p>
        <p className="type-label">Label, 12/16</p>
        <p className="type-metric">₹30,398</p>
        <p className="type-metric-sm">₹2,999</p>
        <p className="type-mono">INV-2026-0042</p>
      </Section>

      <Section title="Button, LinkButton, IconButton">
        {(["sm", "md", "lg"] as const).map((size) => (
          <Row key={size}>
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
          </Row>
        ))}
        <Row>
          <Button variant="primary" icon="Plus">
            New request
          </Button>
          <Button variant="primary" pending>
            Save
          </Button>
          <Button disabled>Disabled</Button>
          <LinkButton href="/design-system">Link button</LinkButton>
          <IconButton icon="Bell" label="Notifications" />
          <IconButton icon="DotsThree" label="More" disabled />
        </Row>
      </Section>

      <Section title="Field, Input, Textarea, PhoneInput, Select, Combobox">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Business name" hint="Shown on your website and Google profile.">
            <Input defaultValue="Apex Diagnostics" />
          </Field>
          <Field label="Email" error="Enter an email address like name@example.com.">
            <Input defaultValue="anand@" />
          </Field>
          <Field label="Phone">
            <PhoneInput placeholder="98765 43210" />
          </Field>
          <Field label="Disabled" disabled>
            <Input defaultValue="Cannot change" />
          </Field>
          <Field label="City" nativeLabel={false}>
            <Select options={CITIES} placeholder="Choose a city" />
          </Field>
          <Field label="Area">
            <Combobox options={CITIES} placeholder="Type a city" emptyText="No city matches." openLabel="Show cities" />
          </Field>
          <Field label="What should change?" hint="One change per request is quickest." className="md:col-span-2">
            <Textarea />
          </Field>
        </div>
      </Section>

      <Section title="Checkbox, Radio, RadioCard, Switch">
        <Checkbox label="Email me about new enquiries" defaultChecked />
        <Checkbox label="Disabled" disabled />
        <RadioGroup aria-label="Contact by" defaultValue="email">
          <Radio value="email" label="Email" />
          <Radio value="phone" label="Phone" />
          <Radio value="none" label="Disabled" disabled />
        </RadioGroup>
        <RadioGroup aria-label="Request type" defaultValue="change" className="md:flex-row">
          <RadioCard value="change" label="A change" description="Something on your website or posts." />
          <RadioCard value="question" label="A question" description="We reply within one working day." />
        </RadioGroup>
        <Row>
          <Switch label="Weekly summary" defaultChecked />
          <Switch label="Disabled" disabled />
        </Row>
      </Section>

      <Section title="Chips, Segmented, Tabs">
        <Chips
          aria-label="Filter"
          value={chip}
          onValueChange={setChip}
          options={[
            { value: "all", label: "All", count: "12" },
            { value: "new", label: "New", count: "4" },
            { value: "won", label: "Won", count: "3" },
          ]}
        />
        <Segmented
          aria-label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: "month", label: "Month" },
            { value: "list", label: "List" },
          ]}
        />
        <TabLinks
          aria-label="Sections"
          current="/design-system"
          items={[
            { href: "/design-system", label: "Overview" },
            { href: "/design-system?tab=pages", label: "Pages", count: "6" },
          ]}
        />
        <Tabs aria-label="Record" items={[{ value: "details", label: "Details" }, { value: "notes", label: "Notes" }]}>
          <TabPanel value="details">Details panel</TabPanel>
          <TabPanel value="notes">Notes panel</TabPanel>
        </Tabs>
      </Section>

      <Section title="Badge, ServiceTag, Avatar, Kbd, Icon">
        <Row>
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
          <Badge tone="warn" icon="Warning">
            Waiting for you
          </Badge>
        </Row>
        <Row>
          <ServiceTag service="website" />
          <ServiceTag service="social" />
          <ServiceTag service="search" />
        </Row>
        <Row>
          <Avatar name="Anand Verma" />
          <Avatar name="Apex Diagnostics" kind="business" />
          <Avatar name="Riya Shah" size="sm" />
          <Kbd>⌘K</Kbd>
        </Row>
        <div className="flex flex-wrap gap-3 text-ink-2">
          {ICON_NAMES.map((name) => (
            <Tooltip key={name} content={name}>
              <span tabIndex={0} className="inline-flex size-8 items-center justify-center rounded-control border border-border">
                <Icon name={name} label={name} />
              </span>
            </Tooltip>
          ))}
        </div>
      </Section>

      <Section title="Menu, Popover, Tooltip">
        <Row>
          <Menu trigger={<Button icon="UserCircle">Account</Button>}>
            <MenuLabel>Anand Verma</MenuLabel>
            <MenuItem icon="UserCircle">Your profile</MenuItem>
            <MenuLinkItem href="/design-system" icon="Lock">
              Sign-in and security
            </MenuLinkItem>
            <MenuSeparator />
            <MenuItem icon="Trash" tone="danger">
              Remove
            </MenuItem>
          </Menu>
          <Popover trigger={<IconButton icon="Bell" label="Notifications" tooltip={false} />} title="Notifications">
            <p className="px-2.5 py-2 type-body">New enquiry from Rohan Mehta</p>
          </Popover>
          <Tooltip content="Full text of a truncated line">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
        </Row>
      </Section>

      <Section title="Dialog, AlertDialog, Sheet, Toast">
        <Row>
          <Dialog
            trigger={<Button>Dialog</Button>}
            title="New request"
            description="Tell us what you need."
            footer={
              <>
                <DialogClose>
                  <Button>Cancel</Button>
                </DialogClose>
                <Button variant="primary">Send</Button>
              </>
            }
          >
            <Field label="What should change?">
              <Textarea />
            </Field>
          </Dialog>
          <AlertDialog
            trigger={<Button variant="danger">AlertDialog</Button>}
            title="Remove Social & Ads?"
            description="It ends on your next billing date. Your plan costs less from then."
            cancelLabel="Keep it"
            action={<Button variant="danger">Remove</Button>}
          />
          <Sheet trigger={<Button>Sheet</Button>} title="Rohan Mehta" description="Website chat" footer={<Button variant="primary">Mark contacted</Button>}>
            <p className="type-body">The record opens here: a right panel on desktop, a bottom sheet on phones.</p>
          </Sheet>
          <ToastDemo />
        </Row>
      </Section>

      <Section title="Banner, EmptyState, Skeleton, Meter">
        <Banner tone="info">Your preview is ready to check.</Banner>
        <Banner tone="warn" action={<Button size="sm">Add photos</Button>}>
          We need three photos of your shop.
        </Banner>
        <Banner tone="neg" action={<Button size="sm">Try again</Button>}>
          <strong className="font-semibold">We could not load this page.</strong> Your data is safe.
        </Banner>
        <Banner tone="pos">Your website is live.</Banner>
        <EmptyState icon="Tray" title="No enquiries yet" description="When someone calls, chats or fills a form, they show up here." action={<Button>Copy your website link</Button>} />
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="w-1/2" />
          <Skeleton className="w-1/3" />
          <Skeleton className="h-7 w-1/4" />
        </div>
        <Meter label="Small edits included this month" value={3} max={5} valueText="3 of 5" />
        <Meter label="Setup" value={12} max={12} valueText="12 of 12" tone="pos" />
      </Section>

      <Section title="Table, Pagination">
        <div className="overflow-hidden rounded-control border border-border">
          <Table>
            <TableHead>
              <TableHeader>Name</TableHeader>
              <TableHeader hideOnPhone>Source</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader align="end">Received</TableHeader>
            </TableHead>
            <TableBody>
              <TableRow interactive>
                <TableCell className="font-medium">Rohan Mehta</TableCell>
                <TableCell hideOnPhone>Website chat</TableCell>
                <TableCell>
                  <Badge tone="accent">New</Badge>
                </TableCell>
                <TableCell align="end">Today, 10:42</TableCell>
              </TableRow>
              <TableRow interactive selected>
                <TableCell className="font-medium">Priya Nair</TableCell>
                <TableCell hideOnPhone>Form</TableCell>
                <TableCell>
                  <Badge tone="pos">Won</Badge>
                </TableCell>
                <TableCell align="end">Yesterday, 17:30</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <TableFooter>
            <span className="flex-1">2 enquiries</span>
            <Pagination page={2} pageCount={3} hrefFor={(page) => `/design-system?page=${page}`} status="Page 2 of 3" previousLabel="Previous page" nextLabel="Next page" />
          </TableFooter>
        </div>
      </Section>

      <Section title="FileDrop">
        <FileDrop
          chooseLabel="Choose photos"
          description="JPG or PNG, up to 4 MB each"
          accept="image/jpeg,image/png"
          multiple
          onFiles={() => undefined}
          files={[
            { id: "1", name: "shop-front.jpg", size: "1.2 MB", progress: 40 },
            { id: "2", name: "menu.pdf", size: "6 MB", error: "Only JPG or PNG can be added." },
            { id: "3", name: "team.png", size: "2.1 MB" },
          ]}
        />
      </Section>
    </div>
  );
}
