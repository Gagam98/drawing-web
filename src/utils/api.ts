const API_BASE_URL = "https://drawing-web-gyrt.onrender.com";

// 기본 API 응답 인터페이스
interface BaseApiResponse {
  [key: string]: unknown;
}

// 방 생성 응답
interface CreateRoomResponse {
  roomId: string;
  roomName: string;
  creatorName: string;
}

// 방 정보 (서버에서 받는 데이터)
interface RoomInfo {
  id: number; // 추가: 서버에서 id를 포함해서 보내주는 경우
  roomId: string;
  roomName: string;
  creatorName: string;
  createdAt: string;
  canvasData?: string;
}

// 메시지 응답
interface MessageResponse {
  message: string;
}

// 토큰 검증 응답
interface TokenValidationResponse {
  valid: boolean;
  userId?: number;
  userName?: string;
  userEmail?: string;
}

// 토큰 가져오기
const getAuthToken = (): string | null => {
  return localStorage.getItem("token");
};

// API 요청 헤더 생성
const getHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// 제네릭 fetch 래퍼 - 타입 안전성 개선
const apiRequest = async <T = BaseApiResponse>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

// 방 관리 API 함수들
export const roomAPI = {
  // 방 생성
  createRoom: async (roomName: string): Promise<CreateRoomResponse> => {
    return apiRequest<CreateRoomResponse>("/api/rooms/create", {
      method: "POST",
      body: JSON.stringify({ roomName }),
    });
  },

  // 방 정보 조회
  getRoomInfo: async (roomId: string): Promise<RoomInfo> => {
    return apiRequest<RoomInfo>(`/api/rooms/${roomId}`);
  },

  // 내가 만든 방 목록
  getMyRooms: async (): Promise<RoomInfo[]> => {
    return apiRequest<RoomInfo[]>("/api/rooms/my-rooms");
  },

  // 방 삭제
  deleteRoom: async (roomId: string): Promise<MessageResponse> => {
    return apiRequest<MessageResponse>(`/api/rooms/${roomId}`, {
      method: "DELETE",
    });
  },

  // 캔버스 데이터 저장
  saveCanvasData: async (
    roomId: string,
    canvasData: string
  ): Promise<MessageResponse> => {
    return apiRequest<MessageResponse>(`/api/rooms/${roomId}/canvas`, {
      method: "POST",
      body: JSON.stringify({ canvasData }),
    });
  },

  // 토큰 검증
  validateToken: async (): Promise<TokenValidationResponse> => {
    return apiRequest<TokenValidationResponse>("/api/rooms/validate-token");
  },
};

// 타입 내보내기
export type {
  RoomInfo,
  CreateRoomResponse,
  MessageResponse,
  TokenValidationResponse,
};
