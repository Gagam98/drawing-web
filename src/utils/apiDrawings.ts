// apiService.ts
import { getToken } from "./authLogin";

const API_BASE_URL = "https://drawing-web-gyrt.onrender.com/api";

export interface Drawing {
  id?: number;
  userId?: number; // optional로 변경
  title: string;
  canvasData: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
  starred?: boolean; // UI에서 사용하는 즐겨찾기 상태
}

export interface User {
  id: number;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  message: string;
  status: number;
  statusText: string;
}

// 드로잉 생성 요청 타입 (userId 제외)
export interface CreateDrawingRequest {
  title: string;
  canvasData: string;
  thumbnail?: string;
  starred?: boolean; // starred 속성 추가
}

// 드로잉 업데이트 요청 타입
export interface UpdateDrawingRequest {
  title?: string;
  canvasData?: string;
  thumbnail?: string;
  starred?: boolean;
}

// JWT 토큰을 헤더에 포함하는 함수
const getAuthHeaders = (): Record<string, string> => {
  const token = getToken(); // authUtils에서 가져오기

  // 토큰이 없으면 경고 로그
  if (!token) {
    console.warn("No authentication token found");
  }

  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// 공통 에러 핸들링 함수
const handleApiError = async (response: Response): Promise<never> => {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorMessage;
  } catch {
    // JSON 파싱 실패시 기본 메시지 사용
  }

  const error: ApiError = {
    message: errorMessage,
    status: response.status,
    statusText: response.statusText,
  };

  // 401 오류시 로그아웃 처리
  if (response.status === 401) {
    console.warn("Token expired or invalid, redirecting to login");
    // 동적 import로 순환 참조 방지
    import("./authLogin").then(({ logout }) => logout());
  }

  throw error;
};

// 공통 fetch 함수
const apiRequest = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    // 204 No Content인 경우 빈 객체 반환
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  } catch (error) {
    // 네트워크 오류 처리
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
      );
    }
    throw error;
  }
};

export const drawingAPI = {
  // 사용자의 모든 드로잉 가져오기
  getDrawings: async (): Promise<Drawing[]> => {
    return apiRequest<Drawing[]>(`${API_BASE_URL}/drawings`);
  },

  // 새 드로잉 생성
  createDrawing: async (drawing: CreateDrawingRequest): Promise<Drawing> => {
    return apiRequest<Drawing>(`${API_BASE_URL}/drawings`, {
      method: "POST",
      body: JSON.stringify(drawing),
    });
  },

  // 드로잉 업데이트
  updateDrawing: async (
    id: number,
    drawing: UpdateDrawingRequest
  ): Promise<Drawing> => {
    return apiRequest<Drawing>(`${API_BASE_URL}/drawings/${id}`, {
      method: "PUT",
      body: JSON.stringify(drawing),
    });
  },

  // 드로잉 삭제
  deleteDrawing: async (id: number): Promise<void> => {
    return apiRequest<void>(`${API_BASE_URL}/drawings/${id}`, {
      method: "DELETE",
    });
  },
};

export const userAPI = {
  getCurrentUser: async (): Promise<User> => {
    return apiRequest<User>(`${API_BASE_URL}/auth/me`);
  },
};
