import { PatientBookingPortal } from '@/components/patient-booking-portal';
export const metadata={title:'Mi solicitud de cita',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function RequestStatusPage(){return <PatientBookingPortal trackingOnly/>;}
