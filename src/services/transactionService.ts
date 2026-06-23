import { database } from '../lib/supabase';
import { Booking, Survey } from '../types';

export const transactionService = {
  async getAllBookings(): Promise<Booking[]> {
    return database.fetchBookings();
  },
  
  async saveBooking(booking: Partial<Booking>): Promise<Booking> {
    return database.saveBooking(booking);
  },
  
  async getAllSurveys(): Promise<Survey[]> {
    return database.fetchSurveys();
  },
  
  async saveSurvey(survey: Partial<Survey>): Promise<Survey> {
    return database.saveSurvey(survey);
  }
};
