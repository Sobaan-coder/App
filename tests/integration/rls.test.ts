// Row level security & data-isolation tests against a real Supabase database.
// Run: SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:integration
import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { actAs, asPostgres, createUser, expectDenied, hasDb, withTx } from "./db";

const FAR_TEMPLATE = "00000000-0000-4000-c000-000000000001";

/** Two students; Alice gets a subject/chapter/topic/resource/paper/conversation. */
async function setup(c: Client) {
  const alice = await createUser(c, "Alice");
  const bob = await createUser(c, "Bob");
  await actAs(c, alice);
  const subject = (await c.query(`insert into subjects (owner_id, name) values ($1, 'Alice FAR') returning id`, [alice])).rows[0].id;
  const chapter = (await c.query(`insert into chapters (subject_id, name) values ($1, 'IAS 16') returning id`, [subject])).rows[0].id;
  const topic = (await c.query(`insert into topics (chapter_id, name) values ($1, 'Revaluation') returning id`, [chapter])).rows[0].id;
  const resource = (
    await c.query(
      `insert into resources (user_id, subject_id, title, type, content, processing_status) values ($1, $2, 'Alice notes', 'note', 'secret', 'ready') returning id`,
      [alice, subject],
    )
  ).rows[0].id;
  await c.query(
    `insert into resource_chunks (resource_id, user_id, chunk_index, page_number, content) values ($1, $2, 0, 1, 'revaluation surplus goes to other comprehensive income')`,
    [resource, alice],
  );
  const paper = (
    await c.query(`insert into past_papers (user_id, subject_id, title, year, processing_status) values ($1, $2, 'P1', 2024, 'ready') returning id`, [alice, subject])
  ).rows[0].id;
  const question = (
    await c.query(`insert into past_paper_questions (past_paper_id, user_id, question_number, question_text) values ($1, $2, '1', 'q') returning id`, [paper, alice])
  ).rows[0].id;
  const convo = (await c.query(`insert into ai_conversations (user_id, title) values ($1, 'Private chat') returning id`, [alice])).rows[0].id;
  await c.query(`insert into ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'my private question')`, [convo, alice]);
  return { alice, bob, subject, chapter, topic, resource, paper, question, convo };
}

describe.skipIf(!hasDb)("row level security", () => {
  it("isolates every private table between students", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.bob);
      for (const table of [
        "subjects where owner_id is not null", "chapters where owner_id is not null", "topics where owner_id is not null",
        "resources", "resource_chunks", "past_papers", "past_paper_questions", "ai_conversations", "ai_messages",
      ]) {
        const { rows } = await c.query(`select count(*)::int as n from ${table}`);
        expect(rows[0].n, table).toBe(0);
      }
      // Alice still sees her own data.
      await actAs(c, s.alice);
      const { rows } = await c.query(`select count(*)::int as n from resources`);
      expect(rows[0].n).toBe(1);
    });
  });

  it("blocks writing rows on behalf of another student", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.bob);
      await expectDenied(c, `insert into tasks (user_id, title) values ($1, 'x')`, [s.alice]);
      await expectDenied(c, `insert into subjects (owner_id, name) values ($1, 'x')`, [s.alice]);
      // Updates/deletes against Alice's rows silently affect nothing.
      const upd = await c.query(`update resources set title = 'hacked' where id = $1`, [s.resource]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query(`delete from past_papers where id = $1`, [s.paper]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("blocks attaching rows to another student's parent records", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.bob);
      // Chapter under Alice's subject: owner is inherited from the parent → fails the insert check.
      await expectDenied(c, `insert into chapters (subject_id, name) values ($1, 'x')`, [s.subject]);
      // Bob's own row pointing at Alice's topic / question / conversation.
      await expectDenied(c, `insert into student_topic_progress (user_id, topic_id) values ($1, $2)`, [s.bob, s.topic]);
      await expectDenied(c, `insert into ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'x')`, [s.convo, s.bob]);
      const bobSubject = (await c.query(`insert into subjects (owner_id, name) values ($1, 'Bob') returning id`, [s.bob])).rows[0].id;
      const bobPaper = (await c.query(`insert into past_papers (user_id, subject_id, title) values ($1, $2, 'B') returning id`, [s.bob, bobSubject])).rows[0].id;
      const bobQ = (
        await c.query(`insert into past_paper_questions (past_paper_id, user_id, question_number, question_text) values ($1, $2, '1', 'q') returning id`, [bobPaper, s.bob])
      ).rows[0].id;
      await expectDenied(c, `insert into question_topic_links (user_id, question_id, topic_id) values ($1, $2, $3)`, [s.bob, bobQ, s.topic]);
      await expectDenied(c, `insert into past_paper_questions (past_paper_id, user_id, question_number, question_text) values ($1, $2, '1', 'q')`, [s.paper, s.bob]);
    });
  });

  it("lets everyone read catalogue templates but nobody edit them", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.bob);
      const { rows } = await c.query(`select name from subjects where id = $1`, [FAR_TEMPLATE]);
      expect(rows[0].name).toBe("Financial Accounting & Reporting");
      const upd = await c.query(`update subjects set name = 'x' where id = $1`, [FAR_TEMPLATE]);
      expect(upd.rowCount).toBe(0);
      const chapterId = (await c.query(`select id from chapters where subject_id = $1 limit 1`, [FAR_TEMPLATE])).rows[0].id;
      await expectDenied(c, `insert into topics (chapter_id, name) values ($1, 'injected')`, [chapterId]);
    });
  });

  it("prevents self-promotion to admin", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.bob);
      const msg = await expectDenied(c, `update profiles set is_admin = true where id = $1`, [s.bob]);
      expect(msg).toMatch(/is_admin/);
      // Normal profile edits work.
      const ok = await c.query(`update profiles set full_name = 'Bobby' where id = $1`, [s.bob]);
      expect(ok.rowCount).toBe(1);
    });
  });

  it("gives anonymous visitors nothing", async () => {
    await withTx(async (c) => {
      await setup(c);
      await actAs(c, null);
      await expectDenied(c, `select count(*) from resources`);
      await expectDenied(c, `select count(*) from subjects`);
    });
  });

  it("scopes retrieval and search RPCs to the caller", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await actAs(c, s.alice);
      const mine = await c.query(`select * from match_resource_chunks('revaluation surplus')`);
      expect(mine.rows.length).toBe(1);
      expect(mine.rows[0].page_number).toBe(1);
      await actAs(c, s.bob);
      const theirs = await c.query(`select * from match_resource_chunks('revaluation surplus')`);
      expect(theirs.rows.length).toBe(0);
      const search = await c.query(`select * from search_workspace('Private chat')`);
      expect(search.rows.length).toBe(0);
    });
  });

  it("protects storage objects by folder", async () => {
    await withTx(async (c) => {
      const s = await setup(c);
      await asPostgres(c);
      await c.query(
        `insert into storage.objects (bucket_id, name, owner_id) values ('student-resources', $1, $2)`,
        [`${s.alice}/notes.pdf`, s.alice],
      );
      await actAs(c, s.bob);
      const { rows } = await c.query(`select count(*)::int as n from storage.objects where bucket_id = 'student-resources'`);
      expect(rows[0].n).toBe(0);
      await expectDenied(c, `insert into storage.objects (bucket_id, name, owner_id) values ('student-resources', $1, $2)`, [
        `${s.alice}/evil.pdf`,
        s.bob,
      ]);
      await actAs(c, s.alice);
      const own = await c.query(`select count(*)::int as n from storage.objects where bucket_id = 'student-resources'`);
      expect(own.rows[0].n).toBe(1);
    });
  });
});

describe.skipIf(!hasDb)("catalogue & syllabus RPCs", () => {
  it("clones a template into a private, editable copy", async () => {
    await withTx(async (c) => {
      const user = await createUser(c);
      await actAs(c, user);
      const id = (await c.query(`select clone_subject_template($1, current_date + 10) as id`, [FAR_TEMPLATE])).rows[0].id;
      const { rows } = await c.query(`select count(*)::int as n from topics where subject_id = $1 and owner_id = $2`, [id, user]);
      expect(rows[0].n).toBeGreaterThan(15);
      // Idempotent: cloning again returns the same subject.
      const again = (await c.query(`select clone_subject_template($1) as id`, [FAR_TEMPLATE])).rows[0].id;
      expect(again).toBe(id);
      const upd = await c.query(`update topics set name = 'Renamed' where subject_id = $1`, [id]);
      expect(upd.rowCount).toBeGreaterThan(0);
    });
  });

  it("saves a reviewed syllabus transactionally", async () => {
    await withTx(async (c) => {
      const user = await createUser(c);
      await actAs(c, user);
      const payload = {
        subjects: [
          {
            name: "Cost Accounting",
            code: "CMA",
            exam_date: "2030-06-01",
            chapters: [
              {
                name: "Overheads",
                weightage: 20,
                topics: [{ name: "OAR calculation", difficulty: 4, learning_objectives: ["Compute OAR"], subtopics: [{ name: "Under/over absorption" }] }],
              },
            ],
          },
        ],
      };
      const ids = (await c.query(`select save_syllabus($1::jsonb) as ids`, [JSON.stringify(payload)])).rows[0].ids;
      expect(ids).toHaveLength(1);
      const topics = await c.query(`select name, parent_topic_id, learning_objectives from topics where subject_id = $1 order by parent_topic_id nulls first`, [ids[0]]);
      expect(topics.rows.map((r) => r.name)).toEqual(["OAR calculation", "Under/over absorption"]);
      expect(topics.rows[1].parent_topic_id).not.toBeNull();
      const exam = await c.query(`select exam_date::text from student_subjects where subject_id = $1`, [ids[0]]);
      expect(exam.rows[0].exam_date).toBe("2030-06-01");
    });
  });

  it("builds the demo workspace only inside the caller's account", async () => {
    await withTx(async (c) => {
      const user = await createUser(c);
      const other = await createUser(c);
      await actAs(c, user);
      await c.query(`select create_demo_workspace()`);
      const papers = await c.query(`select count(*)::int as n from past_papers`);
      expect(papers.rows[0].n).toBe(5);
      const stats = await c.query(
        `select paper_count::int, years from subject_topic_stats((select id from subjects where owner_id = $1 limit 1)) where topic_name = 'Revaluation'`,
        [user],
      );
      expect(stats.rows[0].paper_count).toBe(4);
      await actAs(c, other);
      const none = await c.query(`select count(*)::int as n from past_papers`);
      expect(none.rows[0].n).toBe(0);
    });
  });
});
