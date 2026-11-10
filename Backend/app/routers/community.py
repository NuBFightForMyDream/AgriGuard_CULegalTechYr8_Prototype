"""Community board: groups, posts, comments and likes (open to every signed-in user)."""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.deps import DB, CurrentUser, get_or_404
from app.models import (
    CommunityComment,
    CommunityGroup,
    CommunityLike,
    CommunityPost,
    User,
)

router = APIRouter(prefix="/community", tags=["community"])


def _clean(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("ห้ามเว้นว่าง")
    return v


class PostIn(BaseModel):
    group_id: uuid.UUID
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("title", "body")
    @classmethod
    def _strip(cls, v: str) -> str:
        return _clean(v)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def _strip(cls, v: str) -> str:
        return _clean(v)


def _author(u: User) -> dict:
    return {"id": u.id, "name": u.name, "role": u.role, "organization": u.organization.name}


def _post_out(db, p: CommunityPost, user: User, with_comments: bool = False) -> dict:
    likes = db.scalar(select(func.count()).select_from(CommunityLike).where(CommunityLike.post_id == p.id)) or 0
    liked = db.scalar(select(CommunityLike.id).where(CommunityLike.post_id == p.id, CommunityLike.user_id == user.id)) is not None
    comments = db.scalar(select(func.count()).select_from(CommunityComment).where(CommunityComment.post_id == p.id)) or 0
    out = {
        "id": p.id, "title": p.title, "body": p.body, "created_at": p.created_at,
        "group": {"id": p.group.id, "slug": p.group.slug, "name": p.group.name},
        "author": _author(p.author), "likes": likes, "liked": liked, "comments": comments,
        "can_delete": p.author_user_id == user.id or user.role == "ADMIN",
    }
    if with_comments:
        out["comment_list"] = [
            {"id": c.id, "body": c.body, "created_at": c.created_at, "author": _author(c.author),
             "can_delete": c.author_user_id == user.id or user.role == "ADMIN"}
            for c in p.comments
        ]
    return out


@router.get("/groups")
def groups(db: DB, user: CurrentUser):
    rows = db.scalars(select(CommunityGroup).order_by(CommunityGroup.created_at, CommunityGroup.name)).all()
    counts = dict(db.execute(select(CommunityPost.group_id, func.count()).group_by(CommunityPost.group_id)).all())
    latest = dict(db.execute(select(CommunityPost.group_id, func.max(CommunityPost.created_at)).group_by(CommunityPost.group_id)).all())
    return [{"id": g.id, "slug": g.slug, "name": g.name, "description": g.description, "province": g.province,
             "product_type": g.product_type, "posts": counts.get(g.id, 0), "latest_at": latest.get(g.id)} for g in rows]


@router.get("/posts")
def list_posts(db: DB, user: CurrentUser, group: str | None = None, sort: Literal["new", "top"] = "new", q: str | None = None):
    query = select(CommunityPost).join(CommunityGroup)
    if group:
        query = query.where(CommunityGroup.slug == group)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(CommunityPost.title.ilike(like) | CommunityPost.body.ilike(like))
    posts = [_post_out(db, p, user) for p in db.scalars(query.order_by(CommunityPost.created_at.desc()).limit(100))]
    if sort == "top":
        posts.sort(key=lambda p: (p["likes"] + p["comments"], p["created_at"]), reverse=True)
    return posts


@router.post("/posts", status_code=201)
def create_post(payload: PostIn, db: DB, user: CurrentUser):
    get_or_404(db, CommunityGroup, payload.group_id, "กลุ่ม")
    p = CommunityPost(group_id=payload.group_id, author_user_id=user.id, title=payload.title, body=payload.body)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _post_out(db, p, user)


@router.get("/posts/{post_id}")
def get_post(post_id: uuid.UUID, db: DB, user: CurrentUser):
    return _post_out(db, get_or_404(db, CommunityPost, post_id, "กระทู้"), user, with_comments=True)


@router.delete("/posts/{post_id}")
def delete_post(post_id: uuid.UUID, db: DB, user: CurrentUser):
    p = get_or_404(db, CommunityPost, post_id, "กระทู้")
    if p.author_user_id != user.id and user.role != "ADMIN":
        raise HTTPException(403, "ลบได้เฉพาะกระทู้ของคุณ")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: uuid.UUID, payload: CommentIn, db: DB, user: CurrentUser):
    p = get_or_404(db, CommunityPost, post_id, "กระทู้")
    db.add(CommunityComment(post_id=p.id, author_user_id=user.id, body=payload.body))
    db.commit()
    db.refresh(p)
    return _post_out(db, p, user, with_comments=True)


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: uuid.UUID, db: DB, user: CurrentUser):
    c = get_or_404(db, CommunityComment, comment_id, "ความคิดเห็น")
    if c.author_user_id != user.id and user.role != "ADMIN":
        raise HTTPException(403, "ลบได้เฉพาะความคิดเห็นของคุณ")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/posts/{post_id}/like")
def toggle_like(post_id: uuid.UUID, db: DB, user: CurrentUser):
    p = get_or_404(db, CommunityPost, post_id, "กระทู้")
    existing = db.scalar(select(CommunityLike).where(CommunityLike.post_id == p.id, CommunityLike.user_id == user.id))
    if existing:
        db.delete(existing)
    else:
        db.add(CommunityLike(post_id=p.id, user_id=user.id))
    db.commit()
    return _post_out(db, p, user)
