import type { Metadata } from 'next';
import { RegisterScreen } from '../components/auth/RegisterScreen';

export const metadata: Metadata = {
  title: 'Đăng ký — YooLab',
  description: 'Đăng ký tài khoản YooLab để soạn giảng và thực hành thí nghiệm 3D/VR/XR.',
};

export default function RegisterPage() {
  return <RegisterScreen />;
}
