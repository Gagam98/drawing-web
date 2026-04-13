from datetime import datetime, timedelta
import os
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel
from passlib.context import CryptContext
import jwt

# ====================
# Configuration & Setup
# ====================
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days expiration

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./canvas_app.db")
# SQLAlchemy needs postgresql:// instead of postgres:// which Render often provides
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


# ====================
# SQLAlchemy Database Models
# ====================
class DBUser(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    drawings = relationship("DBDrawing", back_populates="owner")


class DBDrawing(Base):
    __tablename__ = "drawings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    canvas_data = Column(Text, nullable=False)
    thumbnail = Column(Text, nullable=True)
    starred = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("DBUser", back_populates="drawings")


Base.metadata.create_all(bind=engine)


# ====================
# Pydantic Schemas (Matches React Types)
# ====================
class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    createdAt: str
    updatedAt: str

    @classmethod
    def from_db(cls, db_user: DBUser):
        return cls(
            id=db_user.id,
            email=db_user.email,
            name=db_user.name,
            createdAt=db_user.created_at.isoformat() + "Z",
            updatedAt=db_user.updated_at.isoformat() + "Z",
        )


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class DrawingCreate(BaseModel):
    title: str
    canvasData: str
    thumbnail: Optional[str] = None
    starred: Optional[bool] = False


class DrawingUpdate(BaseModel):
    title: Optional[str] = None
    canvasData: Optional[str] = None
    thumbnail: Optional[str] = None
    starred: Optional[bool] = None


class DrawingResponse(BaseModel):
    id: int
    userId: int
    title: str
    canvasData: str
    thumbnail: Optional[str] = None
    starred: bool
    createdAt: str
    updatedAt: str

    @classmethod
    def from_db(cls, db_dwg: DBDrawing):
        return cls(
            id=db_dwg.id,
            userId=db_dwg.user_id,
            title=db_dwg.title,
            canvasData=db_dwg.canvas_data,
            thumbnail=db_dwg.thumbnail,
            starred=db_dwg.starred,
            createdAt=db_dwg.created_at.isoformat() + "Z",
            updatedAt=db_dwg.updated_at.isoformat() + "Z",
        )


# ====================
# Dependencies
# ====================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=401, detail="Invalid Request")
        user_id = int(user_id_str)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Token (PyJWTError): {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Token (General): {str(e)}")

    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ====================
# FastAPI App & Endpoints
# ====================
app = FastAPI(title="Canvas Drawing Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with exact URLs (ex: frontend domain)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 1. 로그인
@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.email == req.email).first()
    if not user or not pwd_context.verify(req.password, user.hashed_password):
        raise HTTPException(
            status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(token=token, user=UserResponse.from_db(user))


# 2. 회원가입
@app.post("/api/auth/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(DBUser).filter(DBUser.email == req.email).first():
        raise HTTPException(status_code=400, detail="이미 사용중인 이메일입니다.")

    hashed_pwd = pwd_context.hash(req.password)
    new_user = DBUser(email=req.email, hashed_password=hashed_pwd, name=req.name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id)})
    return AuthResponse(token=token, user=UserResponse.from_db(new_user))


# 3. 내 정보 확인
@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: DBUser = Depends(get_current_user)):
    return UserResponse.from_db(current_user)


# 4. 내 드로잉 목록 조회
@app.get("/api/drawings", response_model=List[DrawingResponse])
def get_drawings(
    current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)
):
    drawings = (
        db.query(DBDrawing)
        .filter(DBDrawing.user_id == current_user.id)
        .order_by(DBDrawing.updated_at.desc())
        .all()
    )
    return [DrawingResponse.from_db(d) for d in drawings]


# 5. 새 드로잉 생성
@app.post("/api/drawings", response_model=DrawingResponse)
def create_drawing(
    req: DrawingCreate,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_dwg = DBDrawing(
        user_id=current_user.id,
        title=req.title,
        canvas_data=req.canvasData,
        thumbnail=req.thumbnail,
        starred=req.starred,
    )
    db.add(new_dwg)
    db.commit()
    db.refresh(new_dwg)
    return DrawingResponse.from_db(new_dwg)


# 6. 드로잉 업데이트 (저장)
@app.put("/api/drawings/{dwg_id}", response_model=DrawingResponse)
def update_drawing(
    dwg_id: int,
    req: DrawingUpdate,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dwg = (
        db.query(DBDrawing)
        .filter(DBDrawing.id == dwg_id, DBDrawing.user_id == current_user.id)
        .first()
    )
    if not dwg:
        raise HTTPException(status_code=404, detail="해당 캔버스를 찾을 수 없습니다.")

    if req.title is not None:
        dwg.title = req.title
    if req.canvasData is not None:
        dwg.canvas_data = req.canvasData
    if req.thumbnail is not None:
        dwg.thumbnail = req.thumbnail
    if req.starred is not None:
        dwg.starred = req.starred

    db.commit()
    db.refresh(dwg)
    return DrawingResponse.from_db(dwg)


# 7. 드로잉 삭제
@app.delete("/api/drawings/{dwg_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_drawing(
    dwg_id: int,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dwg = (
        db.query(DBDrawing)
        .filter(DBDrawing.id == dwg_id, DBDrawing.user_id == current_user.id)
        .first()
    )
    if not dwg:
        raise HTTPException(status_code=404, detail="해당 캔버스를 찾을 수 없습니다.")

    db.delete(dwg)
    db.commit()
    return None


if __name__ == "__main__":
    import uvicorn

    # Render assigns the active port dynamically via the PORT env variable
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
