import type { Metadata } from "next";
import type { ReactElement } from "react";
import { TodoList } from "@/components/todo/todo-list";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadTodo } from "@/lib/server/todo";

export const metadata: Metadata = { title: "To do" };

interface TodoPageProps {
  readonly searchParams: Promise<{ readonly focus?: string | readonly string[] }>;
}

export default async function TodoPage({ searchParams }: TodoPageProps): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess();
  const [{ items, answers }, { focus }] = await Promise.all([loadTodo(tenant), searchParams]);
  return <TodoList items={items} answers={answers} focus={typeof focus === "string" ? focus : undefined} />;
}
