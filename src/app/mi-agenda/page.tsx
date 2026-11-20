import { PatientBookingPortal } from '@/components/patient-booking-portal';
export const metadata={title:'Mis citas',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function PatientAgendaPage(){return <PatientBookingPortal/>;}
